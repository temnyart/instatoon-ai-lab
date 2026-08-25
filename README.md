# InstaToon AI Lab — Final

Webtoon AI LAB과 완전히 분리된, 독립 4컷 인스타툰 생성 앱입니다.

## 핵심 기능
- 그림체 기준 이미지 1장 업로드
- 1컷~4컷 장면/대사 입력
- OpenAI 이미지 생성으로 각 컷 새로 생성
- 최종 4컷 이미지 안에 말풍선 + 한글 대사 자동 합성
- 같은 내용으로 다시 만들기 / PNG 다운로드

## 입력 형식
각 컷에 아래 형식으로 적으면 됩니다.

```txt
아빠가 소파에 앉아 있고 하린이가 컵을 들고 온다.
하린이: "아빠가!"
아빠: "물 따라달라고?"
```

- 첫 줄(들): 장면 설명
- `이름: 대사` 형식: 말풍선 자동 생성
- `생각: ...` : 생각풍선
- `내레이션: ...` : 네모 내레이션 박스처럼 처리

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
