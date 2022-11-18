import { ApolloError } from 'apollo-server-core'
import { Ttl } from '../config'
import { Resolvers } from '../generated/graphql'

export const markEventResolvers: Resolvers = {
  StreamMarkEvent: {
    async scoresheet (event, args, { dataSources, allowUser, user }) {
      // TODO: check permissions
      const scoresheet = await dataSources.scoresheets.findOneById(event.scoresheetId, { ttl: Ttl.Short })
      if (!scoresheet) throw new ApolloError('Scoresheet not found')

      return scoresheet
    }
  },
  DeviceStreamMarkEvent: {
    async device (event, args, { dataSources, allowUser, user }) {
      // TODO: check permissions
      const device = await dataSources.devices.findOneById(event.deviceId, { ttl: Ttl.Short })
      if (!device) throw new ApolloError('Device not found')

      return device
    }
  }
}
