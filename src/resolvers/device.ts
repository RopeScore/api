import { createJWT } from '../services/authentication'

import type { Resolvers } from '../generated/graphql'
import type { DeviceDoc } from '../store/schema'

export const deviceResolvers: Resolvers = {
  Mutation: {
    async registerDevice (_, args, { dataSources, allowUser }) {
      allowUser.register.assert()

      const device = await dataSources.devices.createRandom({ ttl: 60 }) as DeviceDoc

      return createJWT({ sub: device.id, scope: ['device'] })
    }
  }
}
