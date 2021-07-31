import { Timestamp } from '@google-cloud/firestore'
import { ApolloError } from 'apollo-server'
import { createJWT } from '../services/authentication'
import { isDevice } from '../store/schema'

import type { Resolvers } from '../generated/graphql'
import type { DeviceDoc } from '../store/schema'

export const deviceResolvers: Resolvers = {
  Mutation: {
    async registerDevice (_, args, { dataSources, allowUser }) {
      allowUser.register.assert()

      const device = await dataSources.devices.createRandom({ ttl: 60 }) as DeviceDoc

      return createJWT({ sub: device.id, scope: ['device'] })
    },
    async updateDeviceStatus (_, { batteryStatus }, { dataSources, allowUser, user }) {
      allowUser.updateStatus.assert()
      if (!isDevice(user)) throw new ApolloError('Not logged in as a device')

      const battery: DeviceDoc['battery'] = {
        updatedAt: Timestamp.now(),
        automatic: batteryStatus.automatic,
        batteryLevel: batteryStatus.batteryLevel
      }
      if (typeof batteryStatus.charging === 'boolean') battery.charging = batteryStatus.charging

      return dataSources.devices.updateOnePartial(user.id, {
        battery
      }) as Promise<DeviceDoc>
    }
  }
}
