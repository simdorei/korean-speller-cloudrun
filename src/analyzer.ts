import type { RuleStore } from './db.js'
import type { SpellerClient } from './speller.js'
import type { AnalyzeIntent, AnalyzeResult, RuleAnswer, SpellingSuggestion, ToneFinding } from './types.js'

export type AnalyzeInput = {
  text: string
  mode?: 'auto' | 'rule' | 'proofread' | 'tone'
}

export type AnalyzerDeps = {
  store: RuleStore
  speller: SpellerClient
}

function asksForProofread(text: string, mode?: AnalyzeInput['mode']): boolean {
  if (mode === 'proofread') return true
  if (mode === 'rule' || mode === 'tone') return false
  return /맞춤법\s*(봐|검사|확인|고쳐|교정)|문장\s*(봐|검사|고쳐|교정)|교정해|고쳐줘|띄어쓰기\s*(봐|검사|확인)/u.test(text)
}

function asksForTone(text: string, mode?: AnalyzeInput['mode']): boolean {
  if (mode === 'tone') return true
  return /화법|말투|표현\s*(이상|지적|공격|무례|부드럽)/u.test(text)
}

function buildRuleAnswer(rule: NonNullable<Awaited<ReturnType<RuleStore['findSpellingRule']>>>): RuleAnswer {
  const examples = rule.examples.map((example) => `- ${example}`).join('\n')
  return {
    wrongText: rule.wrongText,
    correctText: rule.correctText,
    explanation: rule.explanation,
    examples: rule.examples,
    category: rule.category,
    confidence: rule.confidence,
    answer: `“${rule.correctText}”가 맞습니다.\n\n이유:\n${rule.explanation}\n\n예:\n${examples}`,
  }
}

function summarizeTone(findings: ToneFinding[]): string | null {
  if (findings.length === 0) return null
  const strong = findings.some((f) => f.severity === 'strong')
  const intro = strong
    ? '이 표현은 상대가 방어적으로 느낄 수 있고, 경우에 따라 공격받는 느낌을 줄 수 있습니다.'
    : '이 표현은 상대가 방어적으로 느낄 수 있어 조금 부드럽게 바꾸는 편이 좋습니다.'
  const items = findings.map((f) => `- “${f.matchedText}”: ${f.feedback} 제안: ${f.suggestion}`).join('\n')
  return `${intro}\n${items}`
}

function chooseIntent(params: { hasRule: boolean, wantsProofread: boolean, wantsTone: boolean, suggestions: SpellingSuggestion[], toneFindings: ToneFinding[] }): AnalyzeIntent {
  const { hasRule, wantsProofread, wantsTone, suggestions, toneFindings } = params
  const hasTone = toneFindings.length > 0
  if ((hasRule && hasTone) || (suggestions.length > 0 && hasTone)) return 'mixed'
  if (wantsProofread || suggestions.length > 0) return 'proofread'
  if (hasRule) return 'rule_qa'
  if (wantsTone || hasTone) return 'tone_feedback'
  return 'unknown'
}

export async function analyzeText(input: AnalyzeInput, deps: AnalyzerDeps): Promise<AnalyzeResult> {
  const text = input.text.trim()
  if (!text) throw new Error('text is required')

  const wantsProofread = asksForProofread(text, input.mode)
  const wantsTone = asksForTone(text, input.mode)
  const [rule, toneFindings] = await Promise.all([
    input.mode === 'proofread' ? Promise.resolve(null) : deps.store.findSpellingRule(text),
    deps.store.findToneFindings(text),
  ])

  let suggestions: SpellingSuggestion[] = []
  let spellerError: string | undefined
  if (wantsProofread && input.mode !== 'rule') {
    try {
      suggestions = await deps.speller.check(text)
    } catch (error) {
      spellerError = error instanceof Error ? error.message : String(error)
    }
  }

  const intent = chooseIntent({ hasRule: rule !== null, wantsProofread, wantsTone, suggestions, toneFindings })

  return {
    intent,
    input: text,
    ruleAnswer: rule ? buildRuleAnswer(rule) : null,
    spelling: {
      suggestions,
      source: suggestions.length > 0 || wantsProofread ? 'speller-api' : rule ? 'rule-db' : 'none',
      ...(spellerError ? { error: spellerError } : {}),
    },
    tone: {
      findings: toneFindings,
      summary: summarizeTone(toneFindings),
    },
  }
}
