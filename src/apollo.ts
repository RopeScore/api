import { ApolloServer, type BaseContext } from '@apollo/server'
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer'
import { expressMiddleware, type ExpressContextFunctionArgument } from '@as-integrations/express5'
import { InMemoryLRUCache } from '@apollo/utils.keyvaluecache'
import { WebSocketServer } from 'ws'
import { useServer } from 'graphql-ws/use/ws'
import { makeExecutableSchema } from '@graphql-tools/schema'
import type { Logger } from 'pino'
import type { Server } from 'http'

import { GCP_PROJECT } from './config'
import typeDefs from './schema'
import { rootResolver as resolvers } from './resolvers/rootResolver'
import loggingPlugin from './plugins/logging'
import {
  type CategoryDataSource,
  categoryDataSource,
  type DeviceDataSource,
  deviceDataSource,
  type DeviceStreamShareDataSource,
  deviceStreamShareDataSource,
  type EntryDataSource,
  entryDataSource,
  type GroupDataSource,
  groupDataSource,
  type JudgeAssignmentDataSource,
  judgeAssignmentDataSource,
  type JudgeDataSource,
  judgeDataSource,
  type ParticipantDataSource,
  participantDataSource,
  type ScoresheetDataSource,
  scoresheetDataSource,
  type UserDataSource,
  userDataSource,
  type RankedResultDataSource,
  rankedResultDataSource,
} from './store/firestoreDataSource'
import { type ServoDeviceSession, type DeviceDoc, type UserDoc } from './store/schema'
import { servoDeviceSessionFromServoAuthorizationHeader, userFromAuthorizationHeader } from './services/authentication'
import { allowUser } from './services/permissions'
import { logger } from './services/logger'

export async function initApollo (httpServer: Server) {
  const plugins = [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    loggingPlugin,
  ]

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
    deviceStreamShares: deviceStreamShareDataSource(cache),
    rankedResults: rankedResultDataSource(cache),
  })

  // graphql-ws
  const graphqlWs = new WebSocketServer({ server: httpServer, path: '/graphql' })
  const serverCleanup = useServer({
    schema,
    async onConnect (context) {
      const authorization = context.connectionParams?.Authorization as string | undefined
      const firebaseAuthorization = context.connectionParams?.['Firebase-Authorization'] as string | undefined
      const servoAuthorization = context.connectionParams?.['Servo-Authorization'] as string | undefined
      const user = await userFromAuthorizationHeader({ authorization, firebaseAuthorization }, { logger, dataSources: getDataSources() })
      const servoDeviceSession = await servoDeviceSessionFromServoAuthorizationHeader(servoAuthorization, { logger, dataSources: getDataSources() })

      if (!user && !servoDeviceSession) return false
    },
    async context (context) {
      const trace = context.connectionParams?.['X-Cloud-Trace-Context'] as string
      const childLogger = logger.child({
        ...(GCP_PROJECT && trace ? { 'logging.googleapis.com/trace': `project/${GCP_PROJECT ?? ''}/traces/${trace ?? ''}` } : {}),
      })
      const authorization = context.connectionParams?.Authorization as string | undefined
      const firebaseAuthorization = context.connectionParams?.['Firebase-Authorization'] as string | undefined
      const servoAuthorization = context.connectionParams?.['Servo-Authorization'] as string | undefined
      const dataSources = getDataSources()
      const user = await userFromAuthorizationHeader({ authorization, firebaseAuthorization }, { logger: childLogger, dataSources })
      const servoDeviceSession = await servoDeviceSessionFromServoAuthorizationHeader(servoAuthorization, { logger: childLogger, dataSources })

      const ctx = {
        ...context,
        user,
        servoDeviceSession,
        allowUser: allowUser(user, servoDeviceSession, { logger: childLogger }),
        logger: childLogger,
        dataSources,
      }

      return ctx
    },
  }, graphqlWs)
  plugins.push({
    async serverWillStart () {
      return {
        async drainServer () {
          await serverCleanup.dispose()
        },
      }
    },
  })

  const server = new ApolloServer({
    schema,
    plugins,
    cache,
    // https://www.apollographql.com/docs/apollo-server/migration/#appropriate-400-status-codes
    status400ForVariableCoercionErrors: true,
  })

  await server.start()

  return expressMiddleware(server, {
    async context (context) {
      const trace = context.req.get('X-Cloud-Trace-Context')
      const childLogger = logger.child({
        ...(GCP_PROJECT && trace ? { 'logging.googleapis.com/trace': `project/${GCP_PROJECT ?? ''}/traces/${trace ?? ''}` } : {}),
      })
      const authorization = context.req.get('authorization')
      const firebaseAuthorization = context.req.get('firebase-authorization')
      const servoAuthorization = context.req.get('servo-authorization')
      const dataSources = getDataSources()
      const user = await userFromAuthorizationHeader({ authorization, firebaseAuthorization }, { logger: childLogger, dataSources })
      const servoDeviceSession = await servoDeviceSessionFromServoAuthorizationHeader(servoAuthorization, { logger: childLogger, dataSources })

      return {
        ...context,
        dataSources,
        user,
        servoDeviceSession,
        allowUser: allowUser(user, servoDeviceSession, { logger: childLogger }),
        logger: childLogger,
      }
    },
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
  rankedResults: RankedResultDataSource
}

export interface RopeScoreContext {
  dataSources: DataSources
  user?: UserDoc | DeviceDoc
  servoDeviceSession?: ServoDeviceSession
  allowUser: ReturnType<typeof allowUser>
  logger: Logger
  skipAuth?: boolean
}

export type ApolloContext = ExpressContextFunctionArgument & BaseContext & RopeScoreContext
