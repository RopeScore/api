import * as Sentry from '@sentry/node'
import '@sentry/tracing'
import { ApolloServer } from 'apollo-server-express'
import { ApolloServerPluginDrainHttpServer } from 'apollo-server-core'
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
  CategoryDataSource,
  DeviceDataSource,
  deviceDataSource,
  entryDataSource,
  EntryDataSource,
  GroupDataSource,
  groupDataSource,
  judgeAssignmentDataSource,
  JudgeAssignmentDataSource,
  judgeDataSource,
  JudgeDataSource,
  participantDataSource,
  ParticipantDataSource,
  ScoresheetDataSource,
  scoresheetDataSource,
  UserDataSource,
  userDataSource
} from './store/firestoreDataSource'
import { DeviceDoc, UserDoc } from './store/schema'
import { userFromAuthorizationHeader } from './services/authentication'
import { allowUser } from './services/permissions'
import { logger } from './services/logger'
import { InMemoryLRUCache } from 'apollo-server-caching'

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
  const getDataSources = () => ({
    users: userDataSource() as any,
    groups: groupDataSource() as any,
    devices: deviceDataSource() as any,
    scoresheets: scoresheetDataSource() as any,
    entries: entryDataSource() as any,
    categories: categoryDataSource() as any,
    judges: judgeDataSource() as any,
    judgeAssignments: judgeAssignmentDataSource() as any,
    participants: participantDataSource() as any
  })

  const cache = new InMemoryLRUCache()

  // graphql-ws
  const graphqlWs = new WebSocketServer({ server: httpServer, path: '/graphql' })
  useServer({
    schema,
    async onConnect (ctx) {
      const authHeader = ctx.connectionParams?.Authorization as string | undefined
      const user = await userFromAuthorizationHeader(authHeader, { logger })

      if (!user) return false
    },
    async context (context) {
      const trace = context.connectionParams?.['X-Cloud-Trace-Context']
      const childLogger = logger.child({
        ...(GCP_PROJECT && trace ? { 'logging.googleapis.com/trace': `project/${GCP_PROJECT ?? ''}/traces/${trace ?? ''}` } : {})
      })
      const authHeader = context.connectionParams?.Authorization as string | undefined
      const user = await userFromAuthorizationHeader(authHeader, { logger: childLogger })

      const ctx = {
        ...context,
        user,
        allowUser: allowUser(user, { logger: childLogger }),
        logger: childLogger,
        dataSources: getDataSources()
      }

      for (const ds of Object.values(ctx.dataSources)) ds.initialize({ cache, context: ctx })

      return ctx
    }
  }, graphqlWs)

  const server = new ApolloServer({
    schema,
    dataSources: getDataSources,
    plugins,
    cache,
    context: async context => {
      const trace = context.req.get('X-Cloud-Trace-Context')
      const childLogger = logger.child({
        ...(GCP_PROJECT && trace ? { 'logging.googleapis.com/trace': `project/${GCP_PROJECT ?? ''}/traces/${trace ?? ''}` } : {})
      })
      const authHeader = context.req.get('authorization')
      const user = await userFromAuthorizationHeader(authHeader, { logger: childLogger })

      return {
        ...context,
        user,
        allowUser: allowUser(user, { logger: childLogger }),
        logger: childLogger
      }
    }
  })

  await server.start()

  return server
}

interface DataSources {
  users: UserDataSource
  groups: GroupDataSource
  categories: CategoryDataSource
  devices: DeviceDataSource
  scoresheets: ScoresheetDataSource
  entries: EntryDataSource
  judges: JudgeDataSource
  judgeAssignments: JudgeAssignmentDataSource
  participants: ParticipantDataSource
}

export type DataSourceContext = DataSources

export interface ApolloContext {
  dataSources: DataSources
  user?: UserDoc | DeviceDoc
  allowUser: ReturnType<typeof allowUser>
  logger: Logger
  skipAuth?: boolean
}
