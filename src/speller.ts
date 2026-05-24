import type { SpellingSuggestion } from './types.js'

export interface SpellerClient {
  check(text: string): Promise<SpellingSuggestion[]>
}

export function createSpellerClient(): SpellerClient {
  const endpoint = process.env.SPELLER_API_URL?.trim()
  if (endpoint) return new HttpSpellerClient(endpoint)
  return new NaraSpellerClient()
}

class HttpSpellerClient implements SpellerClient {
  constructor(private readonly endpoint: string) {}

  async check(text: string): Promise<SpellingSuggestion[]> {
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) throw new Error(`speller-api failed: ${res.status}`)
    const body = await res.json() as { suggestions?: SpellingSuggestion[] }
    return Array.isArray(body.suggestions) ? body.suggestions : []
  }
}

class NaraSpellerClient implements SpellerClient {
  private readonly endpoint = 'https://nara-speller.co.kr/speller/results'

  async check(text: string): Promise<SpellingSuggestion[]> {
    const normalized = text.split('\n').join('\r\n')
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: `text1=${encodeURIComponent(normalized)}`,
    })
    if (!res.ok) throw new Error(`nara-speller failed: ${res.status}`)
    const html = await res.text()
    const dataString = html.match(/data = \[.*;/g)?.[0]
    if (!dataString) return []
    const parsed = JSON.parse(dataString.slice(7, -1))[0]
    const errInfo = Array.isArray(parsed?.errInfo) ? parsed.errInfo : []
    return errInfo
      .filter((err: any) => typeof err?.candWord === 'string' && err.candWord.length > 0)
      .map((err: any) => ({
        description: String(err.help ?? ''),
        start: Number(err.start ?? 0),
        end: Number(err.end ?? 0),
        text: String(err.orgStr ?? ''),
        candidates: String(err.candWord).split('|').filter(Boolean),
      }))
  }
}
