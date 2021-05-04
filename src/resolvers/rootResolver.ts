// import * as deepmerge from 'deepmerge'
import { Resolvers } from '../generated/graphql'

// export const rootResolver = deepmerge.all<Resolver>([
//   groupResolvers,
//   collectionResolvers,
//   userResolvers,
//   postResolvers,
//   playlistResolvers
// ])

export const rootResolver: Resolvers = {
  Query: {
    me: async (_, args, { dataSources }) => {
      return await dataSources.users.findOneById('') ?? null
    }
  }
}
