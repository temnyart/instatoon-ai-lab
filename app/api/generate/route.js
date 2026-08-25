import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const OPENAI_API_URL = 'https://api.openai.com/v1/images/edits';
const DEFAULT_MODEL = 'gpt-image-2';

export async function POST(request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'AI 이미지 생성 키가 아직 연결되지 않았습니다. Vercel Environment Variables에 OPENAI_API_KEY를 추가해주세요.',
          setupRequired: true,
        },
        { status: 503 },
      );
    }

    const formData = await request.formData();
    const master = formData.get('master');
    const rawPanels = formData.get('panels');
    const rawVariant = Number(formData.get('variant') || 1);
    const variant = Number.isFinite(rawVariant) && rawVariant > 0 ? rawVariant : 1;

    if (!master || typeof master === 'string') {
      return NextResponse.json({ error: '그림체 이미지가 필요합니다.' }, { status: 400 });
    }

    if (!master.type?.startsWith('image/')) {
      return NextResponse.json({ error: 'JPG, PNG, WEBP 이미지를 올려주세요.' }, { status: 400 });
    }

    if (master.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: '그림체 이미지는 12MB 이하로 올려주세요.' }, { status: 400 });
    }

    const panels = JSON.parse(String(rawPanels || '[]'));
    if (!Array.isArray(panels) || panels.length !== 4 || panels.some((panel) => !String(panel).trim())) {
      return NextResponse.json({ error: '4컷 내용을 모두 입력해주세요.' }, { status: 400 });
    }

    const panelSummaries = panels.map((panel, index) => parsePanelText(panel, index));
    const masterBytes = Buffer.from(await master.arrayBuffer());
    const model = process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL;

    const storyContinuity = buildStoryContinuity(panelSummaries);
    const generatedPanels = await Promise.all(
      panelSummaries.map((summary, index) =>
        generatePanelWithOpenAI({
          apiKey,
          model,
          masterBytes,
          masterType: master.type || 'image/png',
          masterName: master.name || 'style-master.png',
          summary,
          panelNumber: index + 1,
          storyContinuity,
          variant,
        }),
      ),
    );

    const imageDataUrl = buildFinalSheet(generatedPanels, panelSummaries, variant);

    return NextResponse.json({
      imageDataUrl,
      panelSummaries,
      variant,
      model,
      mode: 'instatoon-final',
    });
  } catch (error) {
    console.error('[InstaToon generate]', error);
    return NextResponse.json({ error: normalizeError(error) }, { status: 500 });
  }
}

async function generatePanelWithOpenAI({
  apiKey,
  model,
  masterBytes,
  masterType,
  masterName,
  summary,
  panelNumber,
  storyContinuity,
  variant,
}) {
  const prompt = buildPanelPrompt({ summary, panelNumber, storyContinuity, variant });
  const body = new FormData();
  body.append('model', model);
  body.append('prompt', prompt);
  body.append('size', '1024x1024');
  body.append('quality', process.env.OPENAI_IMAGE_QUALITY || 'medium');
  body.append('image', new Blob([masterBytes], { type: masterType }), masterName);

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });

  const data = await response.json();
  if (!response.ok) {
    const detail = data?.error?.message || `AI 이미지 생성 실패 (${response.status})`;
    throw new Error(detail);
  }

  const first = data?.data?.[0];
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;

  if (first?.url) {
    const imageResponse = await fetch(first.url);
    if (!imageResponse.ok) throw new Error('생성된 이미지 파일을 불러오지 못했습니다.');
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    return `data:image/png;base64,${bytes.toString('base64')}`;
  }

  throw new Error('AI가 이미지 결과를 반환하지 않았습니다.');
}

function buildPanelPrompt({ summary, panelNumber, storyContinuity, variant }) {
  const dialogueMeaning = summary.dialogues.length
    ? summary.dialogues.map((item) => `${item.speaker || '인물'} says: ${item.text}`).join(' / ')
    : 'No spoken dialogue';

  return [
    'Create ONE finished Instagram 4-cut comic panel image.',
    'The uploaded image is the MASTER visual reference. Match its illustration style closely: line quality, line wobble/hand-drawn looseness, face construction, proportions, color mood, texture, and simplification level.',
    'This is a minimal character comic. Keep the design simple, clean, charming, and highly readable.',
    'Do NOT copy the master composition. Create a new scene for the requested story moment.',
    'IMPORTANT: Draw image art only. Do not render text, Korean letters, captions, speech balloons, panel numbers, borders, logos, UI, or typography. The app adds all Korean dialogue afterward.',
    'Leave enough empty space near the top area and one side of the panel so speech balloons can be overlaid later without covering faces.',
    'Keep recurring characters consistent across the four panels. If multiple family members appear, preserve their hair, height relationship, and clothing logic across panels.',
    `This is panel ${panelNumber} of a 4-panel story. Regeneration variant: ${variant}.`,
    `Whole story continuity: ${storyContinuity}`,
    `THIS PANEL scene: ${summary.scene}`,
    `Emotion / acting tone: ${summary.toneLabel}`,
    `Dialogue meaning for this panel (do NOT draw words): ${dialogueMeaning}`,
    'Use a square comic-panel composition that reads clearly at Instagram size.',
  ].join('\n');
}

function buildStoryContinuity(summaries) {
  return summaries
    .map((item, index) => {
      const dialogue = item.dialogues.length
        ? item.dialogues.map((d) => `${d.speaker || '인물'}: ${d.text}`).join(' / ')
        : '대사 없음';
      return `Panel ${index + 1}: scene=${item.scene}; dialogue=${dialogue}`;
    })
    .join(' | ');
}

function parsePanelText(text = '', index = 0) {
  const normalized = String(text).trim();
  const lines = normalized.split(/\n+/).map((item) => item.trim()).filter(Boolean);

  const sceneLines = [];
  const dialogues = [];

  for (const line of lines) {
    const speakerMatch = line.match(/^([^:：]{1,20})\s*[:：]\s*(.+)$/);
    if (speakerMatch && looksLikeSpeakerLabel(speakerMatch[1])) {
      dialogues.push({
        speaker: speakerMatch[1].trim(),
        text: cleanDialogue(speakerMatch[2]),
        bubbleType: detectBubbleType(speakerMatch[1]),
      });
      continue;
    }

    const genericMatch = line.match(/^(대사|말|한마디|생각|내레이션)\s*[:：]\s*(.+)$/i);
    if (genericMatch) {
      dialogues.push({
        speaker: genericMatch[1].trim(),
        text: cleanDialogue(genericMatch[2]),
        bubbleType: detectBubbleType(genericMatch[1]),
      });
      continue;
    }

    if (/^["'“‘].+["'”’]$/.test(line)) {
      dialogues.push({ speaker: '', text: cleanDialogue(line), bubbleType: 'speech' });
      continue;
    }

    sceneLines.push(line);
  }

  if (!dialogues.length) {
    const inline = normalized.match(/대사\s*[:：]\s*["“]?(.+?)["”]?\s*$/i);
    if (inline) {
      dialogues.push({ speaker: '', text: cleanDialogue(inline[1]), bubbleType: 'speech' });
      const before = normalized.slice(0, inline.index).trim();
      sceneLines.length = 0;
      if (before) sceneLines.push(before);
    }
  }

  const scene = sceneLines.join(' ').replace(/\s+/g, ' ').trim() || '인물들이 자연스럽게 상황을 보여주는 장면';
  const combinedDialogue = dialogues.map((item) => item.text).join(' / ');
  const tone = detectTone(`${scene} ${combinedDialogue}`);

  return {
    index,
    scene,
    dialogues,
    dialogue: dialogues.map((item) => item.text).join(' '),
    tone: tone.key,
    toneLabel: tone.label,
  };
}

function looksLikeSpeakerLabel(label = '') {
  const value = String(label).trim();
  if (!value) return false;
  if (value.length > 12) return false;
  return !/\s{2,}/.test(value);
}

function detectBubbleType(label = '') {
  const normalized = String(label).trim();
  if (/생각/i.test(normalized)) return 'thought';
  if (/내레이션/i.test(normalized)) return 'caption';
  return 'speech';
}

function cleanDialogue(value = '') {
  return String(value)
    .trim()
    .replace(/^(["'“‘])+/u, '')
    .replace(/(["'”’])+$/u, '')
    .trim();
}

function detectTone(text = '') {
  const t = text.toLowerCase();
  if (/놀라|깜짝|헉|충격|급하|허둥|당황/.test(t)) return { key: 'surprised', label: '당황 / 놀람' };
  if (/화나|짜증|버럭|분노|열받/.test(t)) return { key: 'angry', label: '버럭 / 분노' };
  if (/기쁘|행복|좋아|웃|신난|즐거/.test(t)) return { key: 'happy', label: '밝음 / 즐거움' };
  if (/울|슬프|시무룩|우울|한숨/.test(t)) return { key: 'sad', label: '시무룩 / 슬픔' };
  if (/멍|민망|어색|정적/.test(t)) return { key: 'awkward', label: '멍함 / 어색함' };
  return { key: 'calm', label: '일상 / 차분함' };
}

function buildFinalSheet(panelImages, summaries, variant) {
  const width = 1080;
  const height = 1350;
  const margin = 28;
  const gap = 16;
  const headerHeight = 88;
  const panelWidth = (width - margin * 2 - gap) / 2;
  const panelHeight = (height - headerHeight - margin * 2 - gap) / 2;
  const startY = headerHeight + margin;

  const positions = [
    { x: margin, y: startY },
    { x: margin + panelWidth + gap, y: startY },
    { x: margin, y: startY + panelHeight + gap },
    { x: margin + panelWidth + gap, y: startY + panelHeight + gap },
  ];

  const panels = summaries
    .map((summary, index) => renderFinalPanel({
      index,
      summary,
      imageDataUrl: panelImages[index],
      x: positions[index].x,
      y: positions[index].y,
      width: panelWidth,
      height: panelHeight,
    }))
    .join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#ffffff"/>
      <text x="${margin}" y="45" font-family="Arial, Noto Sans KR, sans-serif" font-size="28" font-weight="800" fill="#161616">InstaToon AI Lab</text>
      <text x="${width - margin}" y="44" text-anchor="end" font-family="Arial, Noto Sans KR, sans-serif" font-size="15" font-weight="700" fill="#777">4CUT · V${variant}</text>
      ${panels}
    </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function renderFinalPanel({ index, summary, imageDataUrl, x, y, width, height }) {
  const clipId = `panel-clip-${index}`;
  const bubbles = renderDialogueSet({ x, y, width, height, dialogues: summary.dialogues, panelIndex: index });

  return `
    <g>
      <defs>
        <clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="16"/></clipPath>
      </defs>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="16" fill="#f2f2f2" stroke="#151515" stroke-width="3"/>
      <image href="${imageDataUrl}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>
      <circle cx="${x + 25}" cy="${y + 25}" r="17" fill="#111"/>
      <text x="${x + 25}" y="${y + 31}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="800" fill="#fff">${index + 1}</text>
      ${bubbles}
    </g>`;
}

function renderDialogueSet({ x, y, width, height, dialogues, panelIndex }) {
  if (!Array.isArray(dialogues) || !dialogues.length) return '';

  const maxBubbles = Math.min(dialogues.length, 3);
  const bubbleWidth = Math.min(width - 42, 205);
  const slots = [
    { x: x + 18, y: y + 20, align: 'left', tail: 'left' },
    { x: x + width - bubbleWidth - 18, y: y + 20, align: 'right', tail: 'right' },
    { x: x + (width - bubbleWidth) / 2, y: y + height - 128, align: 'center', tail: panelIndex % 2 === 0 ? 'left' : 'right' },
  ];

  return dialogues.slice(0, maxBubbles).map((item, idx) => {
    const slot = slots[idx] || slots[slots.length - 1];
    return renderBubble({
      x: slot.x,
      y: slot.y,
      width: bubbleWidth,
      text: item.text,
      bubbleType: item.bubbleType,
      speaker: item.speaker,
      align: slot.align,
      tail: slot.tail,
    });
  }).join('');
}

function renderBubble({ x, y, width, text, bubbleType = 'speech', speaker = '', align = 'center', tail = 'left' }) {
  const lines = wrapKoreanText(text, 10, 3);
  const speakerLabel = shouldShowSpeaker(speaker) ? `${speaker}` : '';
  const speakerLines = speakerLabel ? [speakerLabel] : [];
  const allLines = [...speakerLines, ...lines];
  const lineHeight = 22;
  const bubbleHeight = 34 + allLines.length * lineHeight;
  const radius = bubbleType === 'caption' ? 16 : Math.min(42, bubbleHeight / 2);
  const textAnchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
  const textX = align === 'left' ? x + 18 : align === 'right' ? x + width - 18 : x + width / 2;

  const content = allLines.map((line, index) => {
    const isSpeaker = speakerLabel && index === 0;
    return `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}" font-weight="${isSpeaker ? '800' : '700'}">${escapeXml(line)}</tspan>`;
  }).join('');

  const tailSvg = bubbleType === 'caption'
    ? ''
    : tail === 'right'
      ? `<path d="M ${x + width * 0.72} ${y + bubbleHeight - 4} L ${x + width * 0.84} ${y + bubbleHeight + 20} L ${x + width * 0.66} ${y + bubbleHeight - 2} Z" fill="#fff" stroke="#111" stroke-width="3" stroke-linejoin="round"/>`
      : `<path d="M ${x + width * 0.28} ${y + bubbleHeight - 4} L ${x + width * 0.16} ${y + bubbleHeight + 20} L ${x + width * 0.34} ${y + bubbleHeight - 2} Z" fill="#fff" stroke="#111" stroke-width="3" stroke-linejoin="round"/>`;

  if (bubbleType === 'thought') {
    return `
      <g>
        <ellipse cx="${x + width / 2}" cy="${y + bubbleHeight / 2}" rx="${width / 2}" ry="${bubbleHeight / 2}" fill="#fff" stroke="#111" stroke-width="3"/>
        <circle cx="${tail === 'right' ? x + width * 0.8 : x + width * 0.2}" cy="${y + bubbleHeight + 12}" r="7" fill="#fff" stroke="#111" stroke-width="2"/>
        <circle cx="${tail === 'right' ? x + width * 0.87 : x + width * 0.13}" cy="${y + bubbleHeight + 26}" r="4.5" fill="#fff" stroke="#111" stroke-width="2"/>
        <text x="${textX}" y="${y + 28}" text-anchor="${textAnchor}" font-family="Arial, Noto Sans KR, sans-serif" font-size="18" fill="#111">${content}</text>
      </g>`;
  }

  return `
    <g>
      ${tailSvg}
      <rect x="${x}" y="${y}" width="${width}" height="${bubbleHeight}" rx="${radius}" fill="#fff" stroke="#111" stroke-width="3"/>
      <text x="${textX}" y="${y + 28}" text-anchor="${textAnchor}" font-family="Arial, Noto Sans KR, sans-serif" font-size="18" fill="#111">${content}</text>
    </g>`;
}

function shouldShowSpeaker(speaker = '') {
  if (!speaker) return false;
  return !/^(대사|말|한마디|내레이션|생각)$/i.test(String(speaker).trim());
}

function wrapKoreanText(text, maxChars = 10, maxLines = 3) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];

  const lines = [];
  let current = '';
  for (const char of normalized) {
    if ((current + char).length <= maxChars) {
      current += char;
      continue;
    }
    lines.push(current.trim());
    current = char;
    if (lines.length >= maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current.trim());

  if (normalized.length > maxChars * maxLines && lines.length) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = `${lines[lastIndex].slice(0, Math.max(1, maxChars - 1)).trim()}…`;
  }

  return lines;
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeError(error) {
  const message = String(error?.message || '생성에 실패했습니다.');
  if (/billing|quota|credit|balance/i.test(message)) return 'AI API 사용 한도 또는 결제 설정을 확인해주세요.';
  if (/rate limit/i.test(message)) return 'AI 요청이 잠시 몰렸습니다. 잠깐 뒤 다시 만들어주세요.';
  if (/content policy|safety|moderation/i.test(message)) return '입력한 장면 중 이미지 생성 정책에 맞지 않는 내용이 있습니다. 표현을 조금 바꿔주세요.';
  return message;
}
