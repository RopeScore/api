import { createJWT } from '../services/authentication'

import type { Resolvers } from '../generated/graphql'
import { isUser, type UserDoc } from '../store/schema'
import { Timestamp } from '@google-cloud/firestore'
import { Ttl } from '../config'
import { AuthorizationError } from '../errors'

export const userResolvers: Resolvers = {
  Query: {
    async me (_, args, { user }) {
      return user ?? null
    }
  },
  Mutation: {
    async registerUser (_, { name }, { dataSources, allowUser }) {
      allowUser.register.assert()
      const user = await dataSources.users.createOne({
        ...(name != null ? { name } : {})
      }, { ttl: Ttl.Short }) as UserDoc

      return createJWT({ sub: user.id, scope: ['user'] })
    },
    async updateUser (_, { name }, { dataSources, allowUser, user }) {
      allowUser.updateUser.assert()
      if (!isUser(user)) throw new AuthorizationError('You\'re not a user')
      return await dataSources.users.updateOnePartial(user?.id, {
        ...(name != null ? { name } : {})
      }) as UserDoc
    }
  },
  User: {
    async streamShares (user, _, { dataSources, allowUser }) {
      allowUser.user(user).read.assert()

      return dataSources.deviceStreamShares.findManyByUser({ userId: user.id })
    }
  }
}
