import { createJWT } from '../services/authentication'

import type { Resolvers } from '../generated/graphql'
import type { UserDoc } from '../store/schema'
import { Timestamp } from '@google-cloud/firestore'

export const userResolvers: Resolvers = {
  Query: {
    async me (_, args, { user }) {
      return user ?? null
    }
  },
  Mutation: {
    async registerUser (_, args, { dataSources, allowUser }) {
      allowUser.register.assert()
      const user = await dataSources.users.createOne({
        createdAt: Timestamp.now()
      }) as UserDoc

      return createJWT({ sub: user.id, scope: ['user'] })
    }
  }
}
