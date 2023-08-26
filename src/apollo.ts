import * as Sentry from '@sentry/node'
import { ApolloServer, type BaseContext } from '@apollo/server'
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer'
import { expressMiddleware, type ExpressContextFunctionArgument } from '@apollo/server/express4'
import { InMemoryLRUCache } from '@apollo/utils.keyvaluecache'
import { WebSocketServer } from 'ws'
import { useServer } from 'graphql-ws/lib/use/ws'
import { makeExecutableSchema } from '@graphql-tools/schema'
import type { Logger } from 'pino'
import type { Server } from 'http'

import { GCP_PROJECT, SENTRY_DSN } from './config'
import typeDefs from './schema'
import { rootResolver as resolvers } from './resolvers/rootResolver'
import sentryPlugin from './plugins/sentry'
import loggingPlugin from './plugins/logging'
import {
  categoryDataSource,
  type CategoryDataSource,
  type DeviceDataSource,
  deviceDataSource,
  type DeviceStreamShareDataSource,
  deviceStreamShareDataSource,
  entryDataSource,
  type EntryDataSource,
  type GroupDataSource,
  groupDataSource,
  judgeAssignmentDataSource,
  type JudgeAssignmentDataSource,
  judgeDataSource,
  type JudgeDataSource,
  participantDataSource,
  type ParticipantDataSource,
  type ScoresheetDataSource,
  scoresheetDataSource,
  type UserDataSource,
  userDataSource
} from './store/firestoreDataSource'
import { type DeviceDoc, type UserDoc } from './store/schema'
import { userFromAuthorizationHeader } from './services/authentication'
import { allowUser } from './services/permissions'
import { logger } from './services/logger'

export async function initApollo (httpServer: Server) {
  const plugins = [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    loggingPlugin
  ]

  if (SENTRY_DSN) {
    logger.info('Sentry enabled')
    Sentry.init({
      dsn: SENTRY_DSN,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true })
      ],
      tracesSampleRate: 1.0
    })
    plugins.push(sentryPlugin)
  }

  const schema = makeExecutableSchema({ typeDefs, resolvers })
  const cache = new InMemoryLRUCache()

  const getDataSources = (): DataSources => ({
    users: userDataSource(cache),
    groups: groupDataSource(cache),
    devices: deviceDataSource(cache),
    scoresheets: scoresheetDataSource(cache),
    entries: entryDataSource(cache),
    categories: categoryDataSource(cache),
    judges: judgeDataSource(cache),
    judgeAssignments: judgeAssignmentDataSource(cache),
    participants: participantDataSource(cache),
    deviceStreamShares: deviceStreamShareDataSource(cache)
  })

  // graphql-ws
  const graphqlWs = new WebSocketServer({ server: httpServer, path: '/graphql' })
  const serverCleanup = useServer({
    schema,
    async onConnect (ctx) {
      const authHeader = ctx.connectionParams?.Authorization as string | undefined
      const user = await userFromAuthorizationHeader(authHeader, { logger, dataSources: getDataSources() })

      if (!user) return false
    },
    async context (context) {
      const trace = context.connectionParams?.['X-Cloud-Trace-Context'] as string
      const childLogger = logger.child({
        ...(GCP_PROJECT && trace ? { 'logging.googleapis.com/trace': `project/${GCP_PROJECT ?? ''}/traces/${trace ?? ''}` } : {})
      })
      const authHeader = context.connectionParams?.Authorization as string | undefined
      const dataSources = getDataSources()
      const user = await userFromAuthorizationHeader(authHeader, { logger: childLogger, dataSources })

      const ctx = {
        ...context,
        user,
        allowUser: allowUser(user, { logger: childLogger }),
        logger: childLogger,
        dataSources
      }

      return ctx
    }
  }, graphqlWs)
  plugins.push({
    async serverWillStart () {
      return {
        async drainServer () {
          await serverCleanup.dispose()
        }
      }
    }
  })

  const server = new ApolloServer({
    schema,
    plugins,
    cache,
    // https://www.apollographql.com/docs/apollo-server/migration/#appropriate-400-status-codes
    status400ForVariableCoercionErrors: true
  })

  await server.start()

  return expressMiddleware(server, {
    async context (context) {
      const trace = context.req.get('X-Cloud-Trace-Context')
      const childLogger = logger.child({
        ...(GCP_PROJECT && trace ? { 'logging.googleapis.com/trace': `project/${GCP_PROJECT ?? ''}/traces/${trace ?? ''}` } : {})
      })
      const authHeader = context.req.get('authorization')
      const dataSources = getDataSources()
      const user = await userFromAuthorizationHeader(authHeader, { logger: childLogger, dataSources })

      return {
        ...context,
        dataSources,
        user,
        allowUser: allowUser(user, { logger: childLogger }),
        logger: childLogger
      }
    }
  })
}

export interface DataSources {
  users: UserDataSource
  groups: GroupDataSource
  categories: CategoryDataSource
  devices: DeviceDataSource
  scoresheets: ScoresheetDataSource
  entries: EntryDataSource
  judges: JudgeDataSource
  judgeAssignments: JudgeAssignmentDataSource
  participants: ParticipantDataSource
  deviceStreamShares: DeviceStreamShareDataSource
}

export interface RopeScoreContext {
  dataSources: DataSources
  user?: UserDoc | DeviceDoc
  allowUser: ReturnType<typeof allowUser>
  logger: Logger
  skipAuth?: boolean
}

export type ApolloContext = ExpressContextFunctionArgument & BaseContext & RopeScoreContext
