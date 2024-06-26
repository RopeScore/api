import { PORT } from './config'
import { initApollo } from './apollo'
import { logger } from './services/logger'
import express from 'express'
import cors from 'cors'
import http from 'http'
import bodyParser from 'body-parser'

const app = express()
const httpServer = http.createServer(app)

app.use(cors({
  origin: [
    /(^https?:\/\/|\.)ropescore\.(com|app|live)(:\d+)?$/,
    /^app:\/\//,
    /^https?:\/\/localhost(:\d+)?$/,
    'https://studio.apollographql.com'
  ],
  allowedHeaders: [
    'authorization',
    'firebase-authorization',
    'sentry-trace',
    'baggage',
    'content-type'
  ]
}))

initApollo(httpServer).then(async middleware => {
  app.use('/graphql', bodyParser.json(), middleware)
  app.use('/.well-known/apollo/server-health', (req, res) => { res.status(200).json({ status: 'pass' }) })

  await new Promise<void>(resolve => httpServer.listen({ port: PORT }, resolve))
  logger.info(`Server ready at http://localhost:${PORT}`)
})
  .catch(err => {
    logger.error(err)
    process.exit(1)
  })
