import { createRuleStoreFromEnv } from '../src/db.js'

const store = createRuleStoreFromEnv()
await store.migrate()
await store.seedDefaults()
await store.close?.()
console.log('seeded spelling_rules and tone_rules')
