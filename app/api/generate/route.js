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
      mode: 'ai-image-generation',
    });
  } catch (error) {
    console.error('[InstaToon generate]', error);
    return NextResponse.json(
      { error: normalizeError(error) },
      { status: 500 },
    );
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
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  const data = await response.json();
  if (!response.ok) {
    const detail = data?.error?.message || `AI 이미지 생성 실패 (${response.status})`;
    throw new Error(detail);
  }

  const first = data?.data?.[0];
  if (first?.b64_json) {
    return `data:image/png;base64,${first.b64_json}`;
  }

  if (first?.url) {
    const imageResponse = await fetch(first.url);
    if (!imageResponse.ok) throw new Error('생성된 이미지 파일을 불러오지 못했습니다.');
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    return `data:image/png;base64,${bytes.toString('base64')}`;
  }

  throw new Error('AI가 이미지 결과를 반환하지 않았습니다.');
}

function buildPanelPrompt({ summary, panelNumber, storyContinuity, variant }) {
  return [
    'Create ONE finished Instagram comic panel.',
    'The uploaded image is the MASTER visual reference. Match its illustration style very closely: line quality, coloring method, face construction, proportions, simplification, texture, shading density, and overall mood.',
    'Keep the recurring main character visually consistent across all four panels. If the master contains a character, preserve that character design as the recurring protagonist unless the scene clearly requires a different subject.',
    'Do NOT copy the master composition. Create a new scene for the requested story moment.',
    'IMPORTANT: Draw image art only. Do not render text, Korean letters, captions, speech balloons, watermarks, logos, panel numbers, borders, UI, or typography. The app adds Korean dialogue afterward.',
    'Composition should read clearly at small Instagram size. Keep important faces and actions away from the bottom 28% because a speech balloon may be overlaid there.',
    `This is panel ${panelNumber} of a four-panel story. Regeneration variant: ${variant}.`,
    `Whole story continuity: ${storyContinuity}`,
    `THIS PANEL scene: ${summary.scene}`,
    `Character emotion / acting tone: ${summary.toneLabel}.`,
    summary.dialogue ? `The character is saying this, but DO NOT DRAW THE WORDS: ${summary.dialogue}` : 'No spoken dialogue in this panel.',
    'Square comic-panel composition, polished but simple enough for a 4-cut Instagram comic.',
  ].join('\n');
}

function buildStoryContinuity(summaries) {
  return summaries
    .map((item, index) => `Panel ${index + 1}: ${item.scene}${item.dialogue ? ` / dialogue meaning: ${item.dialogue}` : ''}`)
    .join(' | ');
}

function parsePanelText(text = '', index = 0) {
  const normalized = String(text).trim();
  const lines = normalized.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  let dialogue = '';
  const sceneLines = [];

  for (const line of lines) {
    const explicit = line.match(/^(대사|말|한마디|생각|내레이션)\s*:\s*(.+)$/i);
    if (explicit) {
      dialogue = cleanDialogue(explicit[2]);
      continue;
    }

    if (/^["'“‘].+["'”’]$/.test(line)) {
      dialogue = cleanDialogue(line);
      continue;
    }

    sceneLines.push(line);
  }

  if (!dialogue) {
    const inline = normalized.match(/대사\s*:\s*["“]?(.+?)["”]?\s*$/i);
    if (inline) {
      dialogue = cleanDialogue(inline[1]);
      const before = normalized.slice(0, inline.index).trim();
      sceneLines.length = 0;
      if (before) sceneLines.push(before);
    }
  }

  const scene = sceneLines.join(' ').replace(/\s+/g, ' ').trim() || '인물이 자연스럽게 상황을 보여주는 장면';
  const tone = detectTone(`${scene} ${dialogue}`);

  return {
    index,
    scene,
    dialogue,
    tone: tone.key,
    toneLabel: tone.label,
    bubbleType: dialogue ? 'speech' : 'caption',
  };
}

function cleanDialogue(value = '') {
  return String(value)
    .trim()
    .replace(/^["'“‘]+/, '')
    .replace(/["'”’]+$/, '')
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

  const panels = summaries.map((summary, index) => renderFinalPanel({
    index,
    summary,
    imageDataUrl: panelImages[index],
    x: positions[index].x,
    y: positions[index].y,
    width: panelWidth,
    height: panelHeight,
  })).join('');

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
  const bubble = summary.dialogue
    ? renderSpeechBubble({ x, y, width, height, text: summary.dialogue, index })
    : '';

  return `
    <g>
      <defs>
        <clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="16"/></clipPath>
      </defs>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="16" fill="#f2f2f2" stroke="#151515" stroke-width="3"/>
      <image href="${imageDataUrl}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>
      <circle cx="${x + 25}" cy="${y + 25}" r="17" fill="#111"/>
      <text x="${x + 25}" y="${y + 31}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="800" fill="#fff">${index + 1}</text>
      ${bubble}
    </g>`;
}

function renderSpeechBubble({ x, y, width, height, text, index }) {
  const lines = wrapKoreanText(text, 15, 3);
  const bubbleWidth = Math.min(width - 54, 390);
  const bubbleHeight = 72 + Math.max(0, lines.length - 1) * 24;
  const bubbleX = x + (width - bubbleWidth) / 2;
  const bubbleY = y + height - bubbleHeight - 24;
  const tailOnLeft = index % 2 === 0;
  const tailStart = tailOnLeft ? bubbleX + bubbleWidth * 0.34 : bubbleX + bubbleWidth * 0.66;
  const tailTip = tailOnLeft ? bubbleX + bubbleWidth * 0.24 : bubbleX + bubbleWidth * 0.76;
  const textY = bubbleY + 37;
  const tspans = lines.map((line, lineIndex) =>
    `<tspan x="${x + width / 2}" dy="${lineIndex === 0 ? 0 : 24}">${escapeXml(line)}</tspan>`,
  ).join('');

  return `
    <g>
      <path d="M ${tailStart - 14} ${bubbleY + bubbleHeight - 8} L ${tailTip} ${bubbleY + bubbleHeight + 25} L ${tailStart + 16} ${bubbleY + bubbleHeight - 4} Z" fill="#fff" stroke="#111" stroke-width="3" stroke-linejoin="round"/>
      <rect x="${bubbleX}" y="${bubbleY}" width="${bubbleWidth}" height="${bubbleHeight}" rx="${bubbleHeight / 2}" fill="#fff" stroke="#111" stroke-width="3"/>
      <text x="${x + width / 2}" y="${textY}" text-anchor="middle" font-family="Arial, Noto Sans KR, sans-serif" font-size="20" font-weight="800" fill="#111">${tspans}</text>
    </g>`;
}

function wrapKoreanText(text, maxChars = 15, maxLines = 3) {
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
