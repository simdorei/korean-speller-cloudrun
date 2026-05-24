import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { createInMemoryRuleStore } from '../src/db.js'
import type { SpellerClient } from '../src/speller.js'

const speller: SpellerClient = { async check() { return [] } }

describe('HTTP API', () => {
  let store: Awaited<ReturnType<typeof createInMemoryRuleStore>>

  beforeEach(async () => {
    delete process.env.API_KEY
    store = await createInMemoryRuleStore()
    await store.migrate()
    await store.seedDefaults()
  })

  afterEach(() => {
    delete process.env.API_KEY
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

  it('exposes Cloud Run compatible /healthz', async () => {
    const app = createApp({ store, speller })
    const res = await request(app).get('/healthz').expect(200)

    expect(res.body).toEqual({ ok: true })
  })

  it('returns Kakao Skill JSON for userRequest.utterance', async () => {
    const app = createApp({ store, speller })
    const res = await request(app)
      .post('/kakao/skill')
      .send({ userRequest: { utterance: '되요 돼요 뭐가 맞아?', user: { id: 'kakao-user-1' } } })
      .expect(200)

    expect(res.body.version).toBe('2.0')
    expect(res.body.template.outputs[0].simpleText.text).toContain('돼요')
    expect(res.body.template.quickReplies.length).toBeGreaterThan(0)
  })

  it('returns help text for empty Kakao Skill payload', async () => {
    const app = createApp({ store, speller })
    const res = await request(app).post('/kakao/skill').send({}).expect(200)

    expect(res.body.version).toBe('2.0')
    expect(res.body.template.outputs[0].simpleText.text).toContain('문장을 보내면')
  })

  it('keeps /api/analyze private when API_KEY is configured but leaves Kakao webhook public', async () => {
    process.env.API_KEY = 'secret'
    const app = createApp({ store, speller })

    await request(app).post('/api/analyze').send({ text: '되요 돼요 뭐가 맞아?' }).expect(401)
    await request(app).post('/kakao/skill').send({ userRequest: { utterance: '되요 돼요 뭐가 맞아?' } }).expect(200)
  })
})
