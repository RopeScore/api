import { hashPassword } from '../services/authentication'
import type { Resolvers } from '../generated/graphql'

export const userResolvers: Resolvers = {
  Query: {
    async me (_, args, { dataSources, user }) {
      return user ?? null
    }
  },
  Mutation: {
    async createUser (_, { secret }, { dataSources, allowUser }) {
      allowUser.createUser.assert()
      return (await dataSources.users.createOne({
        secret: await hashPassword(secret)
      })) ?? null
    }
  }
}
