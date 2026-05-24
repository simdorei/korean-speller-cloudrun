# Korean Speller Cloud Run API

Cloud Run에서 돌릴 맞춤법 API MVP입니다.

역할 분리:

- Turso/libSQL: 설명형 맞춤법 룰 DB + 이상한 화법 감지 룰 DB
- speller-api: 문장 전체 교정 후보 반환. `SPELLER_API_URL`이 있으면 jhaemin/speller-api 호환 서버를 호출하고, 없으면 부산대/나라인포테크 검사기 endpoint를 직접 호출합니다.
- Cloud Run API: 질문 유형을 라우팅해서 하나의 응답으로 합칩니다.

## API

```http
POST /api/analyze
Content-Type: application/json

{
  "text": "상식적으로 되요 돼요 뭐가 맞아?",
  "mode": "auto"
}
```

`mode`는 선택입니다: `auto`, `rule`, `proofread`, `tone`.

응답 주요 필드:

- `intent`: `rule_qa` / `proofread` / `tone_feedback` / `mixed` / `unknown`
- `ruleAnswer`: Turso 룰 기반 정답·이유·예문
- `spelling.suggestions`: speller-api 교정 후보
- `tone.findings`: 공격적/강압적/이상한 화법 감지 결과
- `tone.summary`: 사용자에게 보여줄 지적 문구

## Local

```bash
cp .env.sample .env
npm install
npm run db:seed
npm test
npm run dev
```

로컬 기본 DB는 `file:local.db`입니다.

## Cloud Run + Turso env

```text
PORT=8080
TURSO_DATABASE_URL=libsql://YOUR_DB.turso.io
TURSO_AUTH_TOKEN=...
SPELLER_API_URL=https://YOUR_SELF_HOSTED_SPELLER_API
API_KEY=원하면_설정
```

브라우저에는 `TURSO_AUTH_TOKEN`을 절대 노출하지 마세요. 이 서버가 Turso를 server-side로만 조회합니다.

## Cloud Run deploy 예시

```bash
gcloud run deploy korean-speller-api \
  --source . \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --set-env-vars TURSO_DATABASE_URL=libsql://YOUR_DB.turso.io \
  --set-secrets TURSO_AUTH_TOKEN=TURSO_AUTH_TOKEN:latest
```

공개 API로 둘 거면 `API_KEY` 또는 Cloud Armor/Rate limit을 붙이는 걸 권장합니다.
