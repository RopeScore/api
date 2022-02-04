import { PORT } from './config'
import { initApollo } from './apollo'
import { logger } from './services/logger'
import express from 'express'
import cors from 'cors'
import http from 'http'

const app = express()
const httpServer = http.createServer(app)

app.use(cors({
  origin: [
    /(^https?:\/\/|\.)ropescore\.(com|app|live)(:\d+)?$/,
    /^app:\/\//,
    /^https?:\/\/localhost(:\d+)?$/,
    'https://studio.apollographql.com'
  ]
}))

initApollo(httpServer).then(async server => {
  server.applyMiddleware({
    app,
    path: '/'
  })

  await new Promise<void>(resolve => httpServer.listen({ port: PORT }, resolve))
  logger.info(`Server ready at http://localhost:${PORT}`)
})
  .catch(err => {
    logger.error(err)
    process.exit(1)
  })
