import { createClient, type Client } from '@libsql/client'
import type { SpellingRule, ToneFinding } from './types.js'

export interface RuleStore {
  migrate(): Promise<void>
  seedDefaults(): Promise<void>
  findSpellingRule(text: string): Promise<SpellingRule | null>
  findToneFindings(text: string): Promise<ToneFinding[]>
  close?(): Promise<void>
}

type SpellRow = {
  id: string
  wrong_text: string
  correct_text: string
  keywords_json: string
  explanation: string
  examples_json: string
  category: string
  confidence: number
}

type ToneRow = {
  id: string
  label: string
  pattern: string
  feedback: string
  suggestion: string
  severity: 'info' | 'warning' | 'strong'
}

const defaultSpellingRules: SpellingRule[] = [
  {
    id: 'spelling-doeyo-dwaeyo',
    wrongText: '되요',
    correctText: '돼요',
    keywords: ['되요', '돼요', '되어요', '되나요', '돼나요'],
    explanation: '“돼요”가 맞습니다. “돼요”는 “되어요”의 줄임말이고, “되요”는 표준 표기가 아닙니다.',
    examples: ['이거 해도 돼요.', '내일 가도 돼요?', '그렇게 하면 안 돼요.'],
    category: '맞춤법',
    confidence: 0.98,
  },
  {
    id: 'spelling-otteokhae-eotteoke',
    wrongText: '어떡해 되나요',
    correctText: '어떻게 되나요',
    keywords: ['어떡해 되나요', '어떻게 되나요', '어떡해', '어떻게'],
    explanation: '방법이나 상태를 묻는 말은 “어떻게”를 씁니다. “어떡해”는 “어떻게 해”가 줄어든 말입니다.',
    examples: ['이 경우에는 어떻게 되나요?', '나 이제 어떡해?'],
    category: '표현',
    confidence: 0.9,
  },
  {
    id: 'spelling-anh-an',
    wrongText: '않 해요',
    correctText: '안 해요',
    keywords: ['안', '않', '않 해요', '안 해요'],
    explanation: '“안”은 부정 부사이고, “않-”은 “아니하-”의 준말입니다. “해요” 앞에는 “안 해요”가 자연스럽습니다.',
    examples: ['오늘은 안 해요.', '그렇게 하지 않아요.'],
    category: '맞춤법',
    confidence: 0.9,
  },
]

const defaultToneRules: ToneRow[] = [
  {
    id: 'tone-common-sense',
    label: '공격적으로 들릴 수 있는 표현',
    pattern: '상식적으로|기본적으로 생각하면|당연히 알',
    feedback: '상대의 이해력이나 상식을 낮춰 보는 뉘앙스로 들릴 수 있습니다.',
    suggestion: '“제가 보기에는”, “이 기준으로 보면”, “확인해보면”처럼 판단 근거 중심으로 바꿔보세요.',
    severity: 'warning',
  },
  {
    id: 'tone-why-cant-you',
    label: '비난형 질문',
    pattern: '왜\\s*(이것도|그것도|이거도|그거도)?\\s*못|그걸\\s*왜\\s*못|뭘\\s*했길래',
    feedback: '문제 해결보다 책임 추궁처럼 들릴 수 있습니다.',
    suggestion: '“어느 부분에서 막혔는지 알려주세요” 또는 “같이 확인해봅시다”처럼 요청형으로 바꿔보세요.',
    severity: 'strong',
  },
  {
    id: 'tone-just-do-it',
    label: '강압적으로 들릴 수 있는 지시',
    pattern: '그냥\\s*알아서\\s*해|알아서\\s*처리해|시키는\\s*대로\\s*해',
    feedback: '상대에게 기준 없이 결과만 강요하는 말처럼 들릴 수 있습니다.',
    suggestion: '“목표는 A이고, 기준은 B입니다. 가능한 방식으로 처리해주세요”처럼 조건을 같이 주세요.',
    severity: 'warning',
  },
  {
    id: 'tone-your-fault',
    label: '책임 전가처럼 들릴 수 있는 표현',
    pattern: '너\\s*때문에|당신\\s*때문에|네가\\s*망쳤|니가\\s*망쳤',
    feedback: '상황 설명보다 인신 책임 추궁으로 받아들여질 수 있습니다.',
    suggestion: '“이 부분에서 문제가 생겼습니다. 원인과 복구 방법을 같이 확인해주세요”처럼 현상 중심으로 바꿔보세요.',
    severity: 'strong',
  },
]

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function rowToRule(row: SpellRow): SpellingRule {
  return {
    id: row.id,
    wrongText: row.wrong_text,
    correctText: row.correct_text,
    keywords: JSON.parse(row.keywords_json),
    explanation: row.explanation,
    examples: JSON.parse(row.examples_json),
    category: row.category,
    confidence: Number(row.confidence),
  }
}

function toneRowToFinding(row: ToneRow, input: string): ToneFinding | null {
  const re = new RegExp(row.pattern, 'iu')
  const matched = input.match(re)?.[0]
  if (!matched) return null
  return {
    ruleId: row.id,
    label: row.label,
    matchedText: matched,
    feedback: row.feedback,
    suggestion: row.suggestion,
    severity: row.severity,
  }
}

export class LibsqlRuleStore implements RuleStore {
  constructor(private readonly client: Client) {}

  async migrate(): Promise<void> {
    await this.client.execute(`CREATE TABLE IF NOT EXISTS spelling_rules (
      id TEXT PRIMARY KEY,
      wrong_text TEXT NOT NULL,
      correct_text TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      explanation TEXT NOT NULL,
      examples_json TEXT NOT NULL,
      category TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.8
    )`)
    await this.client.execute(`CREATE TABLE IF NOT EXISTS tone_rules (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      pattern TEXT NOT NULL,
      feedback TEXT NOT NULL,
      suggestion TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'warning'
    )`)
    await this.client.execute('CREATE INDEX IF NOT EXISTS idx_spelling_wrong ON spelling_rules(wrong_text)')
    await this.client.execute('CREATE INDEX IF NOT EXISTS idx_spelling_correct ON spelling_rules(correct_text)')
  }

  async seedDefaults(): Promise<void> {
    for (const rule of defaultSpellingRules) {
      await this.client.execute({
        sql: `INSERT OR IGNORE INTO spelling_rules
          (id, wrong_text, correct_text, keywords_json, explanation, examples_json, category, confidence)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [rule.id, rule.wrongText, rule.correctText, JSON.stringify(rule.keywords), rule.explanation, JSON.stringify(rule.examples), rule.category, rule.confidence],
      })
    }
    for (const rule of defaultToneRules) {
      await this.client.execute({
        sql: `INSERT OR IGNORE INTO tone_rules
          (id, label, pattern, feedback, suggestion, severity)
          VALUES (?, ?, ?, ?, ?, ?)`,
        args: [rule.id, rule.label, rule.pattern, rule.feedback, rule.suggestion, rule.severity],
      })
    }
  }

  async findSpellingRule(text: string): Promise<SpellingRule | null> {
    const input = normalize(text)
    const result = await this.client.execute('SELECT * FROM spelling_rules')
    const rules = result.rows.map((r) => rowToRule(r as unknown as SpellRow))
    const scored = rules
      .map((rule) => {
        const haystacks = [rule.wrongText, rule.correctText, ...rule.keywords].map(normalize)
        const hitCount = haystacks.filter((needle) => needle && input.includes(needle)).length
        return { rule, hitCount }
      })
      .filter((item) => item.hitCount > 0)
      .sort((a, b) => b.hitCount - a.hitCount || b.rule.confidence - a.rule.confidence)
    return scored[0]?.rule ?? null
  }

  async findToneFindings(text: string): Promise<ToneFinding[]> {
    const result = await this.client.execute('SELECT * FROM tone_rules')
    return result.rows
      .map((row) => toneRowToFinding(row as unknown as ToneRow, text))
      .filter((finding): finding is ToneFinding => finding !== null)
  }

  async close(): Promise<void> {
    this.client.close()
  }
}

export function createRuleStoreFromEnv(): LibsqlRuleStore {
  const url = process.env.TURSO_DATABASE_URL || 'file:local.db'
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined
  return new LibsqlRuleStore(createClient({ url, authToken }))
}

export async function createInMemoryRuleStore(): Promise<LibsqlRuleStore> {
  return new LibsqlRuleStore(createClient({ url: 'file::memory:' }))
}
