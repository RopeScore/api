import './instrument'
import { PORT } from './config'
import { initApollo } from './apollo'
import { logger } from './services/logger'
import express from 'express'
import cors from 'cors'
import http from 'http'
import bodyParser from 'body-parser'
import { setupExpressErrorHandler } from '@sentry/node'

const app = express()
// eslint-disable-next-line @typescript-eslint/no-misused-promises
const httpServer = http.createServer(app)

app.use(cors({
  origin: [
    /(^https?:\/\/|\.)ropescore\.(com|app|live)(:\d+)?$/,
    /^https?:\/\/ropescore-(app|live|core)--[^.]+\.web\.app(:\d+)?$/,
    /^app:\/\//,
    /^https?:\/\/localhost(:\d+)?$/,
    'https://studio.apollographql.com',
  ],
  allowedHeaders: [
    'authorization',
    'firebase-authorization',
    'servo-authorization',
    'sentry-trace',
    'baggage',
    'content-type',
  ],
}))

initApollo(httpServer).then(async middleware => {
  app.use('/graphql', bodyParser.json(), middleware)
  app.use('/.well-known/apollo/server-health', (req, res) => { res.status(200).json({ status: 'pass' }) })

  setupExpressErrorHandler(app)

  await new Promise<void>(resolve => httpServer.listen({ port: PORT }, resolve))
  logger.info(`Server ready at http://localhost:${PORT}`)
})
  .catch(err => {
    logger.error(err)
    process.exit(1)
  })
