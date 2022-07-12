import { Timestamp } from '@google-cloud/firestore'
import { ApolloError } from 'apollo-server-core'
import { Ttl } from '../config'
import { DeviceStreamShareStatus, Resolvers } from '../generated/graphql'
import { DeviceStreamShareDoc } from '../store/schema'

export const deviceStreamShareResolvers: Resolvers = {
  Mutation: {
    async requestDeviceStreamShare (_, { deviceId }, { dataSources, allowUser, user }) {
      allowUser.deviceStreamShare(undefined).request.assert()

      const device = await dataSources.devices.findOneById(deviceId, { ttl: Ttl.Short })
      if (!device) throw new ApolloError('Device does not exist')
      if (!user) throw new ApolloError('User does not exist')

      const existingShare = await dataSources.deviceStreamShares.findOneByDeviceUser({
        deviceId: device.id,
        userId: user.id
      })

      if (existingShare) return existingShare

      return await dataSources.deviceStreamShares.createOne({
        deviceId: device.id,
        userId: user.id,
        status: DeviceStreamShareStatus.Pending,
        expiresAt: Timestamp.fromMillis(Date.now() + 18 * 60 * 60 * 1000) // 18h
      }) as DeviceStreamShareDoc
    },

    async createDeviceStreamShare (_, { userId }, { dataSources, allowUser, user: device }) {
      allowUser.deviceStreamShare(undefined).create.assert()

      const user = await dataSources.users.findOneById(userId, { ttl: Ttl.Short })
      if (!device) throw new ApolloError('Device does not exist')
      if (!user) throw new ApolloError('User does not exist')

      const existingShare = await dataSources.deviceStreamShares.findOneByDeviceUser({
        deviceId: device.id,
        userId: user.id
      })

      if (existingShare) {
        return await dataSources.deviceStreamShares.updateOnePartial(existingShare.id, {
          status: DeviceStreamShareStatus.Accepted,
          expiresAt: Timestamp.fromMillis(Date.now() + 18 * 60 * 60 * 1000) // 18h
        }) as DeviceStreamShareDoc
      } else {
        return await dataSources.deviceStreamShares.createOne({
          deviceId: device.id,
          userId: user.id,
          status: DeviceStreamShareStatus.Pending,
          expiresAt: Timestamp.fromMillis(Date.now() + 18 * 60 * 60 * 1000) // 18h
        }) as DeviceStreamShareDoc
      }
    },
    async deleteDeviceStreamShare (_, { userId }, { dataSources, allowUser, user: device, logger }) {
      const user = await dataSources.users.findOneById(userId, { ttl: Ttl.Short })
      if (!device) throw new ApolloError('Device does not exist')
      if (!user) throw new ApolloError('User does not exist')

      logger.warn({
        deviceId: device.id,
        userId: user.id
      }, 'deleting')

      const existingShare = await dataSources.deviceStreamShares.findOneByDeviceUser({
        deviceId: device.id,
        userId: user.id
      })

      allowUser.deviceStreamShare(existingShare).delete.assert()

      if (!existingShare) throw new ApolloError('Device Stream is not shared')

      await dataSources.deviceStreamShares.deleteManyByDeviceUser({
        deviceId: device.id,
        userId: user.id
      })

      return existingShare
    }
  },
  DeviceStreamShare: {
    async device (share, args, { dataSources, allowUser, user }) {
      // TODO: check permissions
      const device = await dataSources.devices.findOneById(share.deviceId, { ttl: Ttl.Short })
      if (!device) throw new ApolloError('Device not found')

      return device
    },
    async user (share, args, { dataSources, allowUser, user: authUser }) {
      // TODO: check permissions
      const user = await dataSources.users.findOneById(share.userId, { ttl: Ttl.Long })
      if (!user) throw new ApolloError('User not found')

      return user
    }
  }
}
