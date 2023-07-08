import { Ttl } from '../config'
import { NotFoundError } from '../errors'
import { type Resolvers } from '../generated/graphql'

export const markEventResolvers: Resolvers = {
  StreamMarkEvent: {
    async scoresheet (event, args, { dataSources, allowUser, user }) {
      // TODO: check permissions
      const scoresheet = await dataSources.scoresheets.findOneById(event.scoresheetId, { ttl: Ttl.Short })
      if (!scoresheet) throw new NotFoundError('Scoresheet not found')

      return scoresheet
    }
  },
  DeviceStreamMarkEvent: {
    async device (event, args, { dataSources, allowUser, user }) {
      // TODO: check permissions
      const device = await dataSources.devices.findOneById(event.deviceId, { ttl: Ttl.Short })
      if (!device) throw new NotFoundError('Device not found')

      return device
    }
  }
}
