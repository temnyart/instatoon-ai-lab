# InstaToon AI Lab — Phase 4

웹툰 AI Lab과 완전히 분리된 독립 4컷 인스타툰 생성기입니다.

## 사용자 흐름
1. 그림체 마스터 이미지 1장 업로드
2. 1~4컷 장면/대사 입력
3. `인스타툰 만들기`
4. AI가 마스터 그림체를 참조해 컷별 이미지 생성
5. 서버가 한글 말풍선을 후처리 합성
6. 1080×1350 결과 미리보기 및 PNG 다운로드
7. `같은 내용으로 다시 만들기`로 새 변형 생성

## Phase 4 핵심
- 실제 AI 이미지 생성: OpenAI GPT Image API
- 기본 모델: `gpt-image-2`
- 마스터 이미지를 각 컷 생성의 이미지 레퍼런스로 사용
- 컷 4개를 병렬 생성해 대기시간 단축
- 이미지 안에서는 텍스트를 만들지 않고, 한글 대사는 앱에서 정확하게 후처리
- 네 컷 전체 스토리 내용을 각 생성 프롬프트에 함께 전달해 연속성 강화

## Vercel Environment Variables
필수:

```text
OPENAI_API_KEY=...
```

선택:

```text
OPENAI_IMAGE_MODEL=gpt-image-2
OPENAI_IMAGE_QUALITY=medium
```

Vercel에서 키를 추가한 뒤 반드시 Redeploy 해야 서버 함수가 새 환경 변수를 읽습니다.

## 주의
- API 키는 브라우저 코드로 보내지 않습니다. `/api/generate` 서버 라우트에서만 사용합니다.
- 키가 없으면 앱은 가짜 이미지를 생성하지 않고 설정 필요 메시지를 표시합니다.
- 기존 Webtoon AI Lab 저장소/코드는 사용하거나 수정하지 않습니다.
