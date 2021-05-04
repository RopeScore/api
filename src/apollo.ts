import { ApolloServer } from 'apollo-server'
import type { DataSources as ApolloDataSources } from 'apollo-server-core/dist/graphqlOptions'
import * as Sentry from '@sentry/node'
import '@sentry/tracing'
import { SENTRY_DSN } from './config'

import typeDefs from './schema'
import { rootResolver as resolvers } from './resolvers/rootResolver'
import sentryPlugin from './plugins/sentry'
import {
  DeviceDataSource,
  deviceDataSource,
  GroupDataSource,
  groupDataSource,
  ScoresheetDataSource,
  scoresheetDataSource,
  UserDataSource,
  userDataSource
} from './store/firestoreDataSource'

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true })
    ],
    tracesSampleRate: 1.0
  })
}

export const server = new ApolloServer({
  typeDefs,
  resolvers,
  dataSources: (): DataSourceContext => ({
    users: userDataSource as any,
    groups: groupDataSource as any,
    devices: deviceDataSource as any,
    scoresheets: scoresheetDataSource as any
  }),
  plugins: [sentryPlugin],
  context: async (context: ApolloContext) => {
    return context
  }
})

interface DataSources {
  users: UserDataSource
  groups: GroupDataSource
  devices: DeviceDataSource
  scoresheets: ScoresheetDataSource
}

export type DataSourceContext = ApolloDataSources<DataSources>

export interface ApolloContext {
  dataSources: DataSources
}
