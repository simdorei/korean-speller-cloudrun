import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryRuleStore } from '../src/db.js'
import { analyzeText } from '../src/analyzer.js'
import type { SpellerClient } from '../src/speller.js'

const fakeSpeller: SpellerClient = {
  async check(text: string) {
    if (text.includes('어떡해 되나요')) {
      return [{ description: '뜻으로 볼 때 틀렸을 가능성이 큽니다.', start: 12, end: 19, text: '어떡해 되나요', candidates: ['어떻게 되나요'] }]
    }
    return []
  },
}

describe('analyzeText', () => {
  let store: Awaited<ReturnType<typeof createInMemoryRuleStore>>

  beforeEach(async () => {
    store = await createInMemoryRuleStore()
    await store.migrate()
    await store.seedDefaults()
  })

  it('answers explanation-style spelling questions from Turso rule DB', async () => {
    const result = await analyzeText({ text: '되요 돼요 뭐가 맞아?' }, { store, speller: fakeSpeller })

    expect(result.intent).toBe('rule_qa')
    expect(result.ruleAnswer?.correctText).toBe('돼요')
    expect(result.ruleAnswer?.explanation).toContain('되어요')
    expect(result.spelling.suggestions).toEqual([])
  })

  it('uses the speller client for sentence proofreading', async () => {
    const result = await analyzeText({ text: '이 문장 맞춤법 봐줘: 한국어 맞춤법 틀리면 어떡해 되나요?' }, { store, speller: fakeSpeller })

    expect(result.intent).toBe('proofread')
    expect(result.spelling.suggestions[0].text).toBe('어떡해 되나요')
    expect(result.spelling.suggestions[0].candidates).toContain('어떻게 되나요')
  })

  it('detects hostile or awkward speech patterns and suggests a softer wording', async () => {
    const result = await analyzeText({ text: '상식적으로 왜 이것도 못해? 그냥 알아서 해.' }, { store, speller: fakeSpeller })

    expect(result.tone.findings.length).toBeGreaterThanOrEqual(2)
    expect(result.tone.findings.map((f) => f.label)).toContain('공격적으로 들릴 수 있는 표현')
    expect(result.tone.summary).toContain('상대가 방어적으로 느낄 수')
  })

  it('returns a mixed result when a question contains both a known spelling rule and tone issues', async () => {
    const result = await analyzeText({ text: '상식적으로 되요 돼요 정도는 알아서 해야 하는 거 아냐?' }, { store, speller: fakeSpeller })

    expect(result.intent).toBe('mixed')
    expect(result.ruleAnswer?.correctText).toBe('돼요')
    expect(result.tone.findings.length).toBeGreaterThan(0)
  })
})
