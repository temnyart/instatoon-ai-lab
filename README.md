# InstaToon AI Lab — Bubble-in-Image Version

Webtoon AI LAB과 완전히 분리된, 독립 4컷 인스타툰 생성 앱입니다.

## 핵심 변경
이 버전은 **말풍선을 후처리 오버레이로 덧씌우지 않습니다.**

대신:
- 그림체 기준 이미지 1장 업로드
- 1컷~4컷 장면/대사 입력
- OpenAI 이미지 생성으로 **각 컷을 완성된 만화 컷으로 생성**
- 각 컷 안에 **말풍선 / 생각풍선 / 내레이션 / 한글 대사까지 같이 포함**
- 마지막에는 완성된 4컷 이미지를 1080x1350으로 조립

## 입력 형식
각 컷에 아래 형식으로 적으면 됩니다.

```txt
아빠가 소파에 앉아 있고 하린이가 컵을 들고 온다.
하린이: "아빠가!"
아빠: "물 따라달라고?"
```

- 첫 줄(들): 장면 설명
- `이름: 대사` : 일반 말풍선
- `생각: ...` : 생각풍선
- `내레이션: ...` : 내레이션 박스

## 환경변수
Vercel Project Settings → Environment Variables

- `OPENAI_API_KEY` (필수)
- `OPENAI_IMAGE_MODEL` (선택, 기본 `gpt-image-2`)
- `OPENAI_IMAGE_QUALITY` (선택, 기본 `medium`)

## 실행
```bash
npm install
npm run dev
```

## 배포
- Root Directory: `./`
- Framework Preset: Next.js
