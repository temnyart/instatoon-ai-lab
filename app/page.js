'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import './style.css';

const emptyPanels = ['', '', '', ''];
const examplePanels = [
  '아빠가 소파에 앉아 있는데 하린이가 컵을 들고 온다.\n하린이: "아빠가!"\n아빠: "물 따라달라고?"',
  '이번엔 신발을 들고 온다. 아빠는 아직도 감을 잡는 중이다.\n하린이: "아빠가!"\n아빠: "신발 신겨달라고?"',
  '이번엔 장난감 상자를 들고 와서 또 외친다.\n하린이: "아빠가!"\n아빠: "이것도 아빠가?"',
  '아빠가 장난으로 다가간다. 하린이는 바로 고개를 돌린다.\n아빠: "그럼 뽀뽀도 아빠가?"\n하린이: "엄마가!"',
];

export default function Home() {
  const fileRef = useRef(null);
  const resultRef = useRef(null);
  const [masterFile, setMasterFile] = useState(null);
  const [masterUrl, setMasterUrl] = useState('');
  const [masterName, setMasterName] = useState('');
  const [panels, setPanels] = useState(emptyPanels);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [generatedImage, setGeneratedImage] = useState('');
  const [panelSummaries, setPanelSummaries] = useState([]);
  const [generationCount, setGenerationCount] = useState(0);
  const [lastActionLabel, setLastActionLabel] = useState('');

  useEffect(() => {
    const saved = window.localStorage.getItem('instatoon_final_draft');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.panels) && parsed.panels.length === 4) {
        setPanels(parsed.panels);
      }
    } catch {}
  }, []);

  useEffect(() => {
    window.localStorage.setItem('instatoon_final_draft', JSON.stringify({ panels }));
  }, [panels]);

  const completedCount = useMemo(() => panels.filter((item) => item.trim()).length, [panels]);

  const onFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (masterUrl) URL.revokeObjectURL(masterUrl);
    setMasterFile(file);
    setMasterUrl(URL.createObjectURL(file));
    setMasterName(file.name);
  };

  const onExample = () => setPanels(examplePanels);

  const generateToon = async ({ reroll = false } = {}) => {
    setError('');

    if (!masterFile) {
      setError('그림체 이미지를 먼저 올려주세요.');
      return;
    }

    if (completedCount < 4) {
      setError('4컷 내용을 모두 입력해주세요.');
      return;
    }

    try {
      setStatus('loading');
      setLastActionLabel(reroll ? '같은 내용으로 새 버전을 만드는 중...' : '4컷 인스타툰을 만드는 중...');

      const formData = new FormData();
      formData.append('master', masterFile);
      formData.append('panels', JSON.stringify(panels));
      formData.append('variant', String(reroll ? generationCount + 1 : Math.max(1, generationCount || 1)));

      const res = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '생성 중 문제가 발생했습니다.');
      }

      setGeneratedImage(data.imageDataUrl || '');
      setPanelSummaries(data.panelSummaries || []);
      setGenerationCount(data.variant || (reroll ? generationCount + 1 : 1));
      setStatus('done');
      setLastActionLabel(reroll ? '새 버전으로 다시 만들었어요.' : '말풍선이 그림 안에 포함된 인스타툰이 완성됐어요.');
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      setStatus('idle');
      setError(e.message || '생성 중 문제가 발생했습니다.');
    }
  };

  const onClear = () => {
    setPanels(emptyPanels);
    setStatus('idle');
    setGeneratedImage('');
    setPanelSummaries([]);
    setError('');
    setGenerationCount(0);
    setLastActionLabel('');
  };

  const onDownload = async () => {
    if (!generatedImage) return;
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const png = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = png;
      link.download = generationCount > 1 ? `instatoon-4cut-v${generationCount}.png` : 'instatoon-4cut.png';
      link.click();
    };
    img.src = generatedImage;
  };

  return (
    <main className="page">
      <section className="hero">
        <div className="brand">InstaToon <span>AI Lab</span></div>
        <h1>그림체 하나 올리고,<br />4컷 내용만 적으면 끝.</h1>
        <p>장면·대사만 입력하면 AI가 말풍선까지 그림 안에 포함해서 4컷 인스타툰을 완성합니다.</p>
      </section>

      <section className="workcard">
        <div className="sectionTitle">
          <b>1. 그림체 올리기</b>
          <span>항상 기준으로 쓸 그림체 이미지를 1장 업로드하세요.</span>
        </div>

        <button className={`upload ${masterUrl ? 'hasImage' : ''}`} onClick={() => fileRef.current?.click()}>
          {masterUrl ? (
            <>
              <img src={masterUrl} alt="그림체 마스터 미리보기" />
              <div className="uploadOverlay">다른 그림으로 바꾸기</div>
            </>
          ) : (
            <div>
              <div className="uploadIcon">＋</div>
              <strong>그림체 이미지 올리기</strong>
              <small>JPG · PNG · WEBP</small>
            </div>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {masterName && <div className="filename">{masterName}</div>}

        <div className="divider" />

        <div className="sectionTitle">
          <b>2. 4컷 내용 적기</b>
          <span>장면 설명 아래에 “이름: 대사” 형식으로 적으면 AI가 그림 안에 말풍선까지 같이 그립니다.</span>
        </div>

        <div className="topActions">
          <button className="ghost" onClick={onExample}>예시 불러오기</button>
          <div className="miniStatus">입력 완료 <strong>{completedCount}/4</strong></div>
        </div>

        <div className="hintCard">
          <b>입력 예시</b>
          <p>아빠가 소파에 앉아 있고 하린이가 컵을 들고 온다.</p>
          <p>하린이: "아빠가!"</p>
          <p>아빠: "물 따라달라고?"</p>
        </div>

        <div className="panelGrid">
          {panels.map((value, index) => (
            <label className="panelInput" key={index}>
              <span>{index + 1}컷</span>
              <textarea
                value={value}
                onChange={(e) => {
                  const next = [...panels];
                  next[index] = e.target.value;
                  setPanels(next);
                }}
                placeholder={index === 0
                  ? '예) 아빠가 소파에 앉아 있고 하린이가 컵을 들고 온다.\n하린이: “아빠가!”\n아빠: “물 따라달라고?”'
                  : `${index + 1}컷 장면 설명과 대사를 적어주세요.`}
              />
            </label>
          ))}
        </div>

        {error && <div className="errorBox">{error}</div>}

        <button className="primary" onClick={() => generateToon({ reroll: false })} disabled={status === 'loading'}>
          {status === 'loading' ? lastActionLabel || '인스타툰 만드는 중...' : '인스타툰 만들기'}
        </button>
      </section>

      <section className="result" id="result" ref={resultRef}>
        <div className="sectionTitle center">
          <b>완성 미리보기</b>
          <span>
            {status === 'idle' && '생성하면 말풍선이 그림 자체에 포함된 최종 4컷 이미지가 표시됩니다.'}
            {status === 'loading' && (lastActionLabel || '그림과 말풍선을 함께 생성하는 중입니다.')}
            {status === 'done' && lastActionLabel}
          </span>
        </div>

        {status === 'loading' && (
          <div className="loadingCard">
            <div className="spinner" />
            <b>4컷 인스타툰 생성 중</b>
            <p>그림 4컷을 생성하면서 말풍선과 대사도 함께 그리고 있어요.</p>
          </div>
        )}

        {status !== 'loading' && !generatedImage && (
          <div className="emptyResult">아직 생성된 인스타툰이 없습니다.</div>
        )}

        {generatedImage && (
          <>
            <div className="versionBadge">버전 {generationCount}</div>
            <div className="resultImageWrap">
              <img src={generatedImage} alt="생성된 4컷 인스타툰" className="resultImage" />
            </div>

            <div className="speechSummary">
              <strong>완성형 생성</strong>
              <p>각 컷은 그림, 말풍선, 한글 대사까지 한 장의 만화 컷으로 함께 생성됩니다.</p>
              {panelSummaries.length > 0 && <small>현재 생성된 컷 수: {panelSummaries.length}컷</small>}
            </div>
          </>
        )}

        <div className="resultActions">
          <button className="secondary" onClick={() => generateToon({ reroll: true })} disabled={!generatedImage || status === 'loading'}>
            같은 내용으로 다시 만들기
          </button>
          <button className="secondary" onClick={onClear}>입력 지우기</button>
          <button className="secondary dark" onClick={onDownload} disabled={!generatedImage}>다운로드</button>
        </div>
      </section>

      <footer>InstaToon AI Lab · Final</footer>
    </main>
  );
}
