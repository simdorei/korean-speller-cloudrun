# Korean Speller Cloud Run API

Cloud Run에서 돌릴 맞춤법 API MVP입니다.

역할 분리:

- Turso/libSQL: 설명형 맞춤법 룰 DB + 이상한 화법 감지 룰 DB
- speller-api: 문장 전체 교정 후보 반환. `SPELLER_API_URL`이 있으면 jhaemin/speller-api 호환 서버를 호출하고, 없으면 부산대/나라인포테크 검사기 endpoint를 직접 호출합니다.
- Cloud Run API: 질문 유형을 라우팅해서 하나의 응답으로 합칩니다.

## API

### Internal JSON API

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

### Kakao Open Builder Skill webhook

```http
POST /kakao/skill
Content-Type: application/json

{
  "userRequest": {
    "utterance": "되요 돼요 뭐가 맞아?"
  }
}
```

응답은 Kakao Skill v2 형식입니다.

```json
{
  "version": "2.0",
  "template": {
    "outputs": [
      { "simpleText": { "text": "..." } }
    ],
    "quickReplies": []
  }
}
```

Kakao Skill endpoint는 카카오가 커스텀 API 헤더를 붙이기 어렵기 때문에 `API_KEY` 보호 대상에서 제외합니다. `/api/analyze`는 `API_KEY`가 설정되어 있으면 계속 보호됩니다.

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
