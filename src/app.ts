import cors from 'cors'
import express, { type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { analyzeText } from './analyzer.js'
import type { RuleStore } from './db.js'
import type { SpellerClient } from './speller.js'
import type { AnalyzeResult } from './types.js'

const AnalyzeBody = z.object({
  text: z.string().trim().min(1).max(5000),
  mode: z.enum(['auto', 'rule', 'proofread', 'tone']).optional(),
})

type AnalyzeMode = z.infer<typeof AnalyzeBody>['mode']

type KakaoSkillBody = {
  action?: { params?: Record<string, unknown> }
  userRequest?: {
    utterance?: unknown
    user?: { id?: unknown }
  }
}

const HELP_TEXT = [
  '문장을 보내면 맞춤법/표현을 룰 기반으로 봐드립니다.',
  '',
  '예시:',
  '- 되요 돼요 뭐가 맞아?',
  '- 상식적으로 왜 이것도 못해?',
  '- 이 문장 맞춤법 봐줘: 어떡해 되나요?',
].join('\n')

function isPublicEndpoint(req: Request): boolean {
  return (req.method === 'GET' && (req.path === '/health' || req.path === '/healthz'))
    || (req.method === 'POST' && req.path === '/kakao/skill')
}

function pickString(params: Record<string, unknown> | undefined, keys: string[]): string | null {
  if (!params) return null
  for (const key of keys) {
    const value = params[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function extractKakaoUtterance(body: KakaoSkillBody): string {
  const fromParams = pickString(body.action?.params, ['sys_text', 'text', 'query', 'utterance'])
  if (fromParams) return fromParams
  const utterance = body.userRequest?.utterance
  return typeof utterance === 'string' ? utterance.trim() : ''
}

function extractKakaoMode(body: KakaoSkillBody): AnalyzeMode {
  const rawMode = pickString(body.action?.params, ['mode'])
  if (rawMode === 'rule' || rawMode === 'proofread' || rawMode === 'tone' || rawMode === 'auto') return rawMode
  return 'auto'
}

function truncateForKakao(text: string): string {
  return text.length > 900 ? `${text.slice(0, 897)}...` : text
}

function kakaoSkillResponse(text: string) {
  return {
    version: '2.0',
    template: {
      outputs: [
        {
          simpleText: {
            text: truncateForKakao(text),
          },
        },
      ],
      quickReplies: [
        { label: '도움말', action: 'message', messageText: '/도움말' },
        { label: '되요/돼요', action: 'message', messageText: '되요 돼요 뭐가 맞아?' },
        { label: '말투 검사', action: 'message', messageText: '상식적으로 왜 이것도 못해?' },
      ],
    },
  }
}

function formatAnalyzeResultForKakao(result: AnalyzeResult): string {
  if (/^\/?도움말$/u.test(result.input.trim())) return HELP_TEXT

  const sections: string[] = []

  if (result.ruleAnswer) {
    sections.push([
      '🔪 맞춤법 판정',
      `정답: ${result.ruleAnswer.correctText}`,
      `이유: ${result.ruleAnswer.explanation}`,
      result.ruleAnswer.examples.length > 0 ? `예: ${result.ruleAnswer.examples[0]}` : null,
    ].filter(Boolean).join('\n'))
  }

  if (result.spelling.suggestions.length > 0) {
    const items = result.spelling.suggestions.slice(0, 3).map((s, index) => {
      const candidate = s.candidates[0] ?? '후보 없음'
      return `${index + 1}. ${s.text} → ${candidate}${s.description ? `\n   - ${s.description}` : ''}`
    })
    sections.push(['🪓 교정 후보', ...items].join('\n'))
  }

  if (result.tone.summary) {
    sections.push(['⚠️ 말투/표현 감지', result.tone.summary].join('\n'))
  }

  if (sections.length === 0) {
    if (result.spelling.error) {
      return '검사기 연결이 불안정합니다. 지금은 등록된 룰 기준으로만 봤고, 큰 오류는 찾지 못했습니다.'
    }
    return '🛡️ 오늘은 살려준다.\n등록된 룰 기준으로는 큰 맞춤법/표현 문제를 못 찾았습니다.'
  }

  if (result.spelling.error) {
    sections.push('참고: 외부 문장 검사기는 잠시 실패해서 룰 기반 결과만 보여줬습니다.')
  }

  return sections.join('\n\n')
}

export function createApp(deps: { store: RuleStore, speller: SpellerClient }) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '64kb' }))

  app.use((req: Request, res: Response, next: NextFunction) => {
    const apiKey = process.env.API_KEY
    if (!apiKey || isPublicEndpoint(req)) return next()
    const provided = req.header('x-api-key') || req.header('authorization')?.replace(/^Bearer\s+/i, '')
    if (provided !== apiKey) return res.status(401).json({ error: 'unauthorized' })
    return next()
  })

  app.get('/health', (_req, res) => res.json({ ok: true }))
  app.get('/healthz', (_req, res) => res.json({ ok: true }))

  app.post('/api/analyze', async (req, res) => {
    const parsed = AnalyzeBody.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() })
    }

    try {
      const result = await analyzeText(parsed.data, deps)
      return res.json(result)
    } catch (error) {
      return res.status(500).json({ error: 'internal_error', message: error instanceof Error ? error.message : String(error) })
    }
  })

  app.post('/kakao/skill', async (req, res) => {
    const body = req.body as KakaoSkillBody
    const text = extractKakaoUtterance(body)
    if (!text) return res.json(kakaoSkillResponse(HELP_TEXT))

    try {
      const result = await analyzeText({ text, mode: extractKakaoMode(body) }, deps)
      return res.json(kakaoSkillResponse(formatAnalyzeResultForKakao(result)))
    } catch (_error) {
      return res.json(kakaoSkillResponse('잠깐 삐끗했습니다. 문장을 조금 짧게 보내서 다시 시도해주세요.'))
    }
  })

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }))

  return app
}
