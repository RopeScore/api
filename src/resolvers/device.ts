import { Timestamp } from '@google-cloud/firestore'
import { createJWT } from '../services/authentication'
import { isDevice } from '../store/schema'

import type { Resolvers } from '../generated/graphql'
import type { DeviceDoc } from '../store/schema'
import { Ttl } from '../config'
import { AuthorizationError } from '../errors'

export const deviceResolvers: Resolvers = {
  Mutation: {
    async registerDevice (_, args, { dataSources, allowUser }) {
      allowUser.register.assert()

      const device = (await dataSources.devices.createRandom(args, { ttl: Ttl.Short }))!

      return await createJWT({ sub: device.id, scope: ['device'] })
    },
    async updateDeviceStatus (_, { batteryStatus }, { dataSources, allowUser, user }) {
      allowUser.updateStatus.assert()
      if (!isDevice(user)) throw new AuthorizationError('Not logged in as a device')

      const battery: DeviceDoc['battery'] = {
        updatedAt: Timestamp.now(),
        automatic: batteryStatus.automatic,
        batteryLevel: batteryStatus.batteryLevel,
      }
      if (typeof batteryStatus.charging === 'boolean') battery.charging = batteryStatus.charging

      return await (dataSources.devices.updateOnePartial(user.id, {
        battery,
      }) as Promise<DeviceDoc>)
    },
  },
  Device: {
    async streamShares (device, _, { dataSources, allowUser }) {
      allowUser.device(device).read.assert()

      return await dataSources.deviceStreamShares.findManyByDevice({ deviceId: device.id })
    },
  },
}
