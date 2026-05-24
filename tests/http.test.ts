import request from 'supertest'
import { beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createInMemoryRuleStore } from '../src/db.js'
import type { SpellerClient } from '../src/speller.js'

const speller: SpellerClient = { async check() { return [] } }

describe('HTTP API', () => {
  let store: Awaited<ReturnType<typeof createInMemoryRuleStore>>

  beforeEach(async () => {
    store = await createInMemoryRuleStore()
    await store.migrate()
    await store.seedDefaults()
  })

  it('exposes POST /api/analyze', async () => {
    const app = createApp({ store, speller })
    const res = await request(app).post('/api/analyze').send({ text: '되요 돼요 뭐가 맞아?' }).expect(200)

    expect(res.body.intent).toBe('rule_qa')
    expect(res.body.ruleAnswer.correctText).toBe('돼요')
  })

  it('rejects empty text', async () => {
    const app = createApp({ store, speller })
    await request(app).post('/api/analyze').send({ text: '' }).expect(400)
  })
})
