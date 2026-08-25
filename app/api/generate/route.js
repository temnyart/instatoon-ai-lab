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

    const imageDataUrl = buildFinalSheet(generatedPanels, variant);

    return NextResponse.json({
      imageDataUrl,
      panelSummaries,
      variant,
      model,
      mode: 'instatoon-bubbles-inside-image',
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
  const exactDialogueBlock = summary.dialogues.length
    ? summary.dialogues
        .map((item, idx) => {
          const kind = item.bubbleType === 'thought' ? '생각풍선' : item.bubbleType === 'caption' ? '내레이션 박스' : '말풍선';
          const speaker = item.speaker ? `${item.speaker}` : '인물';
          return `${idx + 1}. ${kind} / 화자: ${speaker} / 텍스트: ${item.text}`;
        })
        .join('\n')
    : '대사 없음';

  return [
    '완성된 한국어 인스타툰 1컷을 그려라.',
    '업로드된 이미지는 그림체 마스터다. 선의 삐뚤삐뚤한 손그림 느낌, 단순한 캐릭터 비례, 미니멀하고 귀여운 인스타툰 감성, 은은한 색감, 손으로 그린 듯한 자연스러운 흔들림을 최대한 가깝게 따라라.',
    '중요: 이번에는 말풍선, 생각풍선, 내레이션 박스를 그림 안에 자연스럽게 포함해서 완성된 만화 컷처럼 만들어라.',
    '중요: 아래에 제공된 한국어 대사를 정확히 그대로 그림 속 말풍선/박스 안에 넣어라. 임의로 바꾸거나 요약하지 말고, 가능한 한 정확한 한글로 써라.',
    '중요: 말풍선은 캐릭터 입이나 시선과 자연스럽게 연결되어야 하고, 후처리 오버레이처럼 보이면 안 된다. 그림의 일부처럼 자연스럽게 통합해라.',
    '중요: 패널 번호, 앱 UI, 워터마크, 영어 텍스트, 불필요한 장식은 넣지 마라. 오직 장면과 말풍선이 포함된 완성된 만화 컷만 만들어라.',
    '장면은 하나의 정사각형 만화 컷으로 만들고, 인물과 말풍선이 답답하지 않게 잘 읽히도록 구성해라.',
    '가족/등장인물은 4컷 전체에서 같은 사람처럼 유지해라. 머리모양, 안경 유무, 체형, 옷 분위기를 일관되게 맞춰라.',
    `이 컷은 전체 4컷 중 ${panelNumber}컷이다. 재생성 버전 번호는 ${variant}다.`,
    `전체 스토리 흐름: ${storyContinuity}`,
    `현재 컷 장면 설명: ${summary.scene}`,
    `현재 컷 감정 톤: ${summary.toneLabel}`,
    '현재 컷에 꼭 들어가야 할 한국어 대사/말풍선 목록:',
    exactDialogueBlock,
    '말풍선 개수는 위 목록에 맞춰라. 대사가 없으면 말풍선 없이 장면만 그려라.',
  ].join('\n');
}

function buildStoryContinuity(summaries) {
  return summaries
    .map((item, index) => {
      const dialogue = item.dialogues.length
        ? item.dialogues.map((d) => `${d.speaker || '인물'}: ${d.text}`).join(' / ')
        : '대사 없음';
      return `${index + 1}컷 장면=${item.scene}; 대사=${dialogue}`;
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
    .replace(/^(?:["'“‘])+/, '')
    .replace(/(?:["'”’])+$/, '')
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

function buildFinalSheet(panelImages, variant) {
  const width = 1080;
  const height = 1350;
  const margin = 26;
  const gap = 18;
  const headerHeight = 82;
  const panelWidth = (width - margin * 2 - gap) / 2;
  const panelHeight = (height - headerHeight - margin * 2 - gap) / 2;
  const startY = headerHeight + margin;

  const positions = [
    { x: margin, y: startY },
    { x: margin + panelWidth + gap, y: startY },
    { x: margin, y: startY + panelHeight + gap },
    { x: margin + panelWidth + gap, y: startY + panelHeight + gap },
  ];

  const panels = panelImages
    .map((imageDataUrl, index) => renderPanelImage({
      x: positions[index].x,
      y: positions[index].y,
      width: panelWidth,
      height: panelHeight,
      imageDataUrl,
      index,
    }))
    .join('');

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#fdfcf8"/>
      <text x="${margin}" y="44" font-family="Arial, Noto Sans KR, sans-serif" font-size="28" font-weight="800" fill="#171717">InstaToon AI Lab</text>
      <text x="${width - margin}" y="44" text-anchor="end" font-family="Arial, Noto Sans KR, sans-serif" font-size="15" font-weight="700" fill="#777">4CUT · V${variant}</text>
      ${panels}
    </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

function renderPanelImage({ x, y, width, height, imageDataUrl, index }) {
  const clipId = `clip-${index}`;
  return `
    <g>
      <defs>
        <clipPath id="${clipId}">
          <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18"/>
        </clipPath>
      </defs>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="#ffffff" stroke="#171717" stroke-width="3"/>
      <image href="${imageDataUrl}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})"/>
      <circle cx="${x + 24}" cy="${y + 24}" r="16" fill="#111111"/>
      <text x="${x + 24}" y="${y + 30}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="800" fill="#ffffff">${index + 1}</text>
    </g>`;
}

function normalizeError(error) {
  const message = String(error?.message || '생성에 실패했습니다.');
  if (/billing|quota|credit|balance/i.test(message)) return 'AI API 사용 한도 또는 결제 설정을 확인해주세요.';
  if (/rate limit/i.test(message)) return 'AI 요청이 잠시 몰렸습니다. 잠깐 뒤 다시 만들어주세요.';
  if (/content policy|safety|moderation/i.test(message)) return '입력한 장면 중 이미지 생성 정책에 맞지 않는 내용이 있습니다. 표현을 조금 바꿔주세요.';
  return message;
}
