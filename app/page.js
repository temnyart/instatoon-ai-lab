'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import './style.css';

const emptyPanels = ['', '', '', ''];
const examplePanels = [
  '아침에 늦잠 자고 놀라서 벌떡 일어난다.\n대사: "헉, 늦었다!"',
  '허둥지둥 옷을 입으며 뛰어나갈 준비를 한다.\n대사: "왜 알람을 못 들었지?"',
  '엘리베이터를 기다리다가 문이 바로 닫혀버린다.\n대사: "잠깐만요!"',
  '숨차게 도착했는데 오늘이 휴일이라는 걸 알게 된다.\n대사: "...오늘 쉬는 날이었네."',
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
    const saved = window.localStorage.getItem('instatoon_phase3_draft');
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed.panels) && parsed.panels.length === 4) {
        setPanels(parsed.panels);
      }
    } catch {}
  }, []);

  useEffect(() => {
    window.localStorage.setItem('instatoon_phase3_draft', JSON.stringify({ panels }));
  }, [panels]);

  const completedCount = useMemo(() => panels.filter((item) => item.trim()).length, [panels]);

  const onFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (masterUrl) URL.revokeObjectURL(masterUrl);
    setMasterFile(file);
    setMasterUrl(URL.createObjectURL(file));
    setMasterName(file.name);
  };

  const onExample = () => {
    setPanels(examplePanels);
  };

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
      setLastActionLabel(reroll ? '같은 내용으로 다시 만드는 중...' : '인스타툰 만드는 중...');
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
      setLastActionLabel(reroll ? '새 버전으로 다시 만들었어요.' : '생성이 완료됐습니다.');
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
        <p>초간단 입력은 유지하면서, 말풍선·재생성·한글 정리를 더 안정화한 3단계 버전입니다.</p>
      </section>

      <section className="workcard">
        <div className="sectionTitle">
          <b>1. 그림체 올리기</b>
          <span>원하는 그림체 샘플 1장을 넣어주세요.</span>
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
          <span>장면과 대사를 한 칸에 같이 적으면 됩니다.</span>
        </div>

        <div className="topActions">
          <button className="ghost" onClick={onExample}>예시 불러오기</button>
          <div className="miniStatus">입력 완료 <strong>{completedCount}/4</strong></div>
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
                  ? '예) 아침에 늦잠 자고 놀라서 일어난다.\n대사: “헉! 늦었다!”'
                  : `${index + 1}컷의 장면과 대사를 적어주세요.`}
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
            {status === 'idle' && '생성하면 여기에 결과가 표시됩니다.'}
            {status === 'loading' && (lastActionLabel || '그림체와 4컷 내용을 조합하는 중입니다.')}
            {status === 'done' && lastActionLabel}
          </span>
        </div>

        {status === 'loading' && (
          <div className="loadingCard">
            <div className="spinner" />
            <b>4컷 인스타툰 생성 중</b>
            <p>말풍선과 컷 구성을 다시 정리하고 있어요.</p>
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

            <div className="summaryGrid">
              {panelSummaries.map((item, index) => (
                <div className="summaryCard" key={index}>
                  <strong>{index + 1}컷</strong>
                  <p>{item.scene}</p>
                  {item.dialogue ? <small>대사: {item.dialogue}</small> : <small>대사 없음</small>}
                  <em>{item.toneLabel}</em>
                </div>
              ))}
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

      <footer>InstaToon AI Lab · Phase 3</footer>
    </main>
  );
}
