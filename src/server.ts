import { createApp } from './app.js'
import { createRuleStoreFromEnv } from './db.js'
import { createSpellerClient } from './speller.js'

const port = Number(process.env.PORT || 8080)
const store = createRuleStoreFromEnv()
await store.migrate()
await store.seedDefaults()

const app = createApp({ store, speller: createSpellerClient() })
app.listen(port, () => {
  console.log(`korean-speller-cloudrun listening on ${port}`)
})
