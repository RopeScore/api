// import 'pino-debug'
import { PORT } from './config'
import { initApollo } from './apollo'
import { logger } from './services/logger'
import express from 'express'
import http from 'http'
// import { GRAPHQL_WS } from 'subscriptions-transport-ws'
// import { GRAPHQL_TRANSPORT_WS_PROTOCOL } from 'graphql-ws'

const app = express()
const httpServer = http.createServer(app)

initApollo(httpServer).then(async server => {
  server.applyMiddleware({
    app,
    path: '/'
    // TODO: CORS
  })

  await new Promise<void>(resolve => httpServer.listen({ port: PORT }, resolve))
  logger.info(`Server ready at http://localhost:${PORT}`)
})
  .catch(err => {
    logger.error(err)
    process.exit(1)
  })
