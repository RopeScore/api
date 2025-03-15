import { createJWT } from '../services/authentication'

import type { Resolvers } from '../generated/graphql'
import { isUser } from '../store/schema'
import { Ttl } from '../config'
import { AuthorizationError } from '../errors'
import { auth } from 'firebase-admin'

export const userResolvers: Resolvers = {
  Query: {
    async me (_, args, { user }) {
      return user ?? null
    },
  },
  Mutation: {
    async registerUser (_, { name }, { dataSources, allowUser }) {
      allowUser.register.assert()
      const user = (await dataSources.users.createOne({
        ...(name != null ? { name } : {}),
      }, { ttl: Ttl.Short }))!

      return await createJWT({ sub: user.id, scope: ['user'] })
    },
    async updateUser (_, { name }, { dataSources, allowUser, user }) {
      allowUser.updateUser.assert()
      if (!isUser(user)) throw new AuthorizationError('You\'re not a user')
      return (await dataSources.users.updateOnePartial(user?.id, {
        ...(name != null ? { name } : {}),
      }))!
    },
  },
  User: {
    async streamShares (user, _, { dataSources, allowUser }) {
      allowUser.user(user).read.assert()

      return await dataSources.deviceStreamShares.findManyByUser({ userId: user.id })
    },
    async username (user, _, { dataSources, allowUser }) {
      allowUser.user(user).read.assert()
      if (!user.firebaseAuthId) return null

      const firebaseUser = await auth().getUser(user.firebaseAuthId)

      return firebaseUser.email
    },
  },
}
