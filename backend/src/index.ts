import { app } from './app'
import { runTemporalWorker } from './worker'

app.listen(4000, () => {
  console.log('Express server is running on port 4000')
})

runTemporalWorker().catch((err) => {
  console.error(err)
  process.exit(1)
})
