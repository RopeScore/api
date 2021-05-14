import { ApolloError } from 'apollo-server-errors'
import type { Resolvers } from '../generated/graphql'

export const scoresheetResolvers: Resolvers = {
  Mutation: {

  },
  Scoresheet: {
    async device (scoresheet, args, { dataSources, allowUser }) {
      allowUser.scoresheet(scoresheet).get.assert()
      const device = await dataSources.devices.findOneById(scoresheet.deviceId, { ttl: 60 })
      if (!device) throw new ApolloError(`Missing device for scoresheet ${scoresheet.id}`)
      return device
    },
    async group (scoresheet, args, { dataSources, allowUser }) {
      allowUser.scoresheet(scoresheet).get.assert()
      const group = await dataSources.groups.findOneById(scoresheet.groupId, { ttl: 60 })
      if (!group) throw new ApolloError(`Missing group for scoresheet ${scoresheet.id}`)
      return group
    }
  }
}
