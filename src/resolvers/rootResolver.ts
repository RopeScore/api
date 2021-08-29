import * as deepmerge from 'deepmerge'
import { TimestampScalar } from '../scalars'
import { GraphQLJSONObject } from 'graphql-type-json'
import { isDevice } from '../store/schema'
import { groupResolvers } from './group'
import { userResolvers } from './user'
import { deviceResolvers } from './device'
import { scoresheetResolvers } from './scoresheet'
import { entryResolvers } from './entry'

import type { Resolvers } from '../generated/graphql'

export const commonResolvers: Resolvers = {
  Actor: {
    __resolveType (obj) {
      if (isDevice(obj)) {
        return 'Device'
      } else {
        return 'User'
      }
    }
  },
  Timestamp: TimestampScalar,
  JSONObject: GraphQLJSONObject
}

export const rootResolver = deepmerge.all<Resolvers>([
  commonResolvers,
  userResolvers,
  groupResolvers,
  deviceResolvers,
  scoresheetResolvers,
  entryResolvers
])
