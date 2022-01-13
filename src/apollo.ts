import { ApolloServer } from 'apollo-server'
import * as Sentry from '@sentry/node'
import '@sentry/tracing'
import type { Logger } from 'pino'

import { GCP_PROJECT, SENTRY_DSN } from './config'
import typeDefs from './schema'
import { rootResolver as resolvers } from './resolvers/rootResolver'
import sentryPlugin from './plugins/sentry'
import loggingPlugin from './plugins/logging'
import {
  DeviceDataSource,
  deviceDataSource,
  entryDataSource,
  EntryDataSource,
  GroupDataSource,
  groupDataSource,
  ScoresheetDataSource,
  scoresheetDataSource,
  UserDataSource,
  userDataSource
} from './store/firestoreDataSource'
import { DeviceDoc, UserDoc } from './store/schema'
import { userFromAuthorizationHeader } from './services/authentication'
import { allowUser } from './services/permissions'
import { logger } from './services/logger'

const plugins = [loggingPlugin]

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

export const server = new ApolloServer({
  typeDefs,
  resolvers,
  dataSources: () => ({
    users: userDataSource() as any,
    groups: groupDataSource() as any,
    devices: deviceDataSource() as any,
    scoresheets: scoresheetDataSource() as any,
    entries: entryDataSource() as any
  }),
  plugins,
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

interface DataSources {
  users: UserDataSource
  groups: GroupDataSource
  devices: DeviceDataSource
  scoresheets: ScoresheetDataSource
  entries: EntryDataSource
}

export type DataSourceContext = DataSources

export interface ApolloContext {
  dataSources: DataSources
  user?: UserDoc | DeviceDoc
  allowUser: ReturnType<typeof allowUser>
  logger: Logger
  skipAuth?: boolean
}
