export type SpellingSuggestion = {
  description: string
  start: number
  end: number
  text: string
  candidates: string[]
}

export type SpellingRule = {
  id: string
  wrongText: string
  correctText: string
  keywords: string[]
  explanation: string
  examples: string[]
  category: string
  confidence: number
}

export type ToneFinding = {
  ruleId: string
  label: string
  matchedText: string
  feedback: string
  suggestion: string
  severity: 'info' | 'warning' | 'strong'
}

export type RuleAnswer = {
  wrongText: string
  correctText: string
  explanation: string
  examples: string[]
  category: string
  confidence: number
  answer: string
}

export type AnalyzeIntent = 'rule_qa' | 'proofread' | 'tone_feedback' | 'mixed' | 'unknown'

export type AnalyzeResult = {
  intent: AnalyzeIntent
  input: string
  ruleAnswer: RuleAnswer | null
  spelling: {
    suggestions: SpellingSuggestion[]
    source: 'rule-db' | 'speller-api' | 'none'
    error?: string
  }
  tone: {
    findings: ToneFinding[]
    summary: string | null
  }
}
