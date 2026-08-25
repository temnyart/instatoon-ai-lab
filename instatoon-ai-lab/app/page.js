'use client';

import { useRef, useState } from 'react';
import './style.css';

const emptyPanels = ['', '', '', ''];

export default function Home() {
  const fileRef = useRef(null);
  const [masterUrl, setMasterUrl] = useState('');
  const [masterName, setMasterName] = useState('');
  const [panels, setPanels] = useState(emptyPanels);
  const [status, setStatus] = useState('idle');

  const onFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (masterUrl) URL.revokeObjectURL(masterUrl);
    setMasterUrl(URL.createObjectURL(file));
    setMasterName(file.name);
  };

  const onGenerate = () => {
    setStatus('preview');
    document.getElementById('result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const onReset = () => {
    setStatus('idle');
  };

  const onDownload = () => {
    alert('1단계에서는 UI 흐름만 완성했습니다. 실제 이미지 다운로드는 AI 생성 연결 후 활성화됩니다.');
  };

  return (
    <main className="page">
      <section className="hero">
        <div className="brand">InstaToon <span>AI Lab</span></div>
        <h1>그림체 하나 올리고,<br />4컷 내용만 적으면 끝.</h1>
        <p>복잡한 설정 없이 4컷 인스타툰을 만드는 가장 단순한 화면입니다.</p>
      </section>

      <section className="workcard">
        <div className="sectionTitle">
          <b>1. 그림체 올리기</b>
          <span>원하는 그림체 이미지 1장을 넣어주세요.</span>
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
          <span>장면과 대사를 그냥 한 칸에 같이 적으면 됩니다.</span>
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

        <button className="primary" onClick={onGenerate}>인스타툰 만들기</button>
      </section>

      <section className="result" id="result">
        <div className="sectionTitle center">
          <b>완성 미리보기</b>
          <span>{status === 'idle' ? '생성하면 여기에 결과가 표시됩니다.' : '1단계 UI 미리보기입니다.'}</span>
        </div>

        <div className="toonSheet">
          {panels.map((text, index) => (
            <div className="toonPanel" key={index}>
              <div className="panelNo">{index + 1}</div>
              {status === 'preview' ? (
                <>
                  <div className="mockArt">
                    {masterUrl ? <img src={masterUrl} alt="스타일 미리보기" /> : <span>AI IMAGE</span>}
                  </div>
                  <p>{text || `${index + 1}컷 내용이 여기에 반영됩니다.`}</p>
                </>
              ) : (
                <div className="emptyPanel">{index + 1}컷</div>
              )}
            </div>
          ))}
        </div>

        <div className="resultActions">
          <button className="secondary" onClick={onReset}>다시 만들기</button>
          <button className="secondary dark" onClick={onDownload}>다운로드</button>
        </div>
      </section>

      <footer>InstaToon AI Lab · Phase 1</footer>
    </main>
  );
}
