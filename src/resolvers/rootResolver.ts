import * as deepmerge from 'deepmerge'
import { TimestampScalar } from '../scalars'
import { isDevice } from '../store/schema'
import { groupResolvers } from './group'
import { userResolvers } from './user'
import type { Resolvers } from '../generated/graphql'
import { deviceResolvers } from './device'

export const commonResolvers: Resolvers = {
  UserDevice: {
    __resolveType (obj) {
      if (isDevice(obj)) {
        return 'Device'
      } else {
        return 'User'
      }
    }
  },
  Timestamp: TimestampScalar
}

export const rootResolver = deepmerge.all<Resolvers>([
  commonResolvers,
  userResolvers,
  groupResolvers,
  deviceResolvers
])
