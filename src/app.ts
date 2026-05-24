import cors from 'cors'
import express, { type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { analyzeText } from './analyzer.js'
import type { RuleStore } from './db.js'
import type { SpellerClient } from './speller.js'

const AnalyzeBody = z.object({
  text: z.string().trim().min(1).max(5000),
  mode: z.enum(['auto', 'rule', 'proofread', 'tone']).optional(),
})

export function createApp(deps: { store: RuleStore, speller: SpellerClient }) {
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '64kb' }))

  app.use((req: Request, res: Response, next: NextFunction) => {
    const apiKey = process.env.API_KEY
    if (!apiKey) return next()
    const provided = req.header('x-api-key') || req.header('authorization')?.replace(/^Bearer\s+/i, '')
    if (provided !== apiKey) return res.status(401).json({ error: 'unauthorized' })
    return next()
  })

  app.get('/health', (_req, res) => res.json({ ok: true }))

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

  app.use((_req, res) => res.status(404).json({ error: 'not_found' }))

  return app
}
