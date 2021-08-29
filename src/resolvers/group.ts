import { ApolloError } from 'apollo-server'
import { isDevice, isUser } from '../store/schema'
import { Timestamp } from '@google-cloud/firestore'
import type { Resolvers } from '../generated/graphql'
import type { DeviceDoc, GroupDoc, UserDoc } from '../store/schema'

export const groupResolvers: Resolvers = {
  Query: {
    async group (_, { groupId }, { dataSources, allowUser }) {
      const group = await dataSources.groups.findOneById(groupId, { ttl: 60 })
      allowUser.group(group).get.assert()
      return group ?? null
    },
    async groups (_, args, { dataSources, user, allowUser }) {
      allowUser.getGroups.assert()
      if (!user) return []
      return (await dataSources.groups.findManyByUser(user, { ttl: 60 })) ?? []
    }
  },
  Mutation: {
    async createGroup (_, { name }, { dataSources, user, allowUser }) {
      allowUser.createGroup.assert()
      user = user as UserDoc | DeviceDoc
      const group = await dataSources.groups.createOne({
        name, // TODO: prevent XSS
        admin: user.id,
        viewers: [],
        devices: [],
        createdAt: Timestamp.now(),
        scoresheetsLastFetchedAt: {}
      }, { ttl: 60 }) as GroupDoc
      return group
    },
    async completeGroup (_, { groupId }, { dataSources, allowUser }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: 60 })
      allowUser.group(group).complete.assert()
      group = group as GroupDoc

      return await dataSources.groups.updateOnePartial(groupId, { completedAt: Timestamp.now() }) as GroupDoc
    },
    async addGroupViewer (_, { groupId, userId }, { dataSources, allowUser }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: 60 })
      allowUser.group(group).addViewers.assert()
      group = group as GroupDoc

      if (group.admin === userId) throw new ApolloError('Viewer is already admin')
      if (group.viewers.includes(userId)) throw new ApolloError('Viewer already in group')

      const addUser = await dataSources.users.findOneById(userId, { ttl: 60 })
      if (!addUser) throw new ApolloError(`user ${userId} not found`)

      group.viewers.push(userId)
      group.viewers = [...new Set(group.viewers)]
      return await dataSources.groups.updateOne(group) as GroupDoc
    },
    async removeGroupViewer (_, { groupId, userId }, { dataSources, allowUser }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: 60 })
      allowUser.group(group).removeViewers.assert()
      group = group as GroupDoc

      const vIdx = group.viewers.indexOf(userId)
      if (vIdx === -1) throw new ApolloError('Viewer not part of group')

      group.viewers.splice(vIdx, 1)
      return await dataSources.groups.updateOne(group) as GroupDoc
    },
    async addGroupDevice (_, { groupId, deviceId }, { dataSources, allowUser }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: 60 })
      allowUser.group(group).addDevices.assert()
      group = group as GroupDoc

      if (group.devices.includes(deviceId)) throw new ApolloError('Device already in group')

      const addDevice = await dataSources.devices.findOneById(deviceId, { ttl: 60 })
      if (!addDevice) throw new ApolloError(`device ${deviceId} not found`)

      group.devices.push(deviceId)
      group.devices = [...new Set(group.devices)]
      return await dataSources.groups.updateOne(group) as GroupDoc
    },
    async removeGroupDevice (_, { groupId, deviceId }, { dataSources, allowUser }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: 60 })
      allowUser.group(group).removeDevices.assert()
      group = group as GroupDoc

      // TODO also remove scoresheets for the device

      const vIdx = group.devices.indexOf(deviceId)
      if (vIdx === -1) throw new ApolloError('Device not part of group')

      group.devices.splice(vIdx, 1)
      return await dataSources.groups.updateOne(group) as GroupDoc
    }
  },
  Group: {
    async admin (group, args, { dataSources, allowUser }) {
      allowUser.group(group).get.assert()
      const admin = await dataSources.users.findOneById(group.admin, { ttl: 60 })
      if (!admin) throw new ApolloError(`Missing admin for group ${group.id}`)
      return admin
    },
    async viewers (group, args, { dataSources, allowUser }) {
      allowUser.group(group).getViewers.assert()
      return (await dataSources.users.findManyByIds(group.viewers, { ttl: 60 }))
        .filter(u => isUser(u)) as UserDoc[]
    },
    async devices (group, args, { dataSources, allowUser }) {
      allowUser.group(group).getDevices.assert()
      return (await dataSources.devices.findManyByIds(group.devices, { ttl: 60 }))
        .filter(u => isDevice(u)) as DeviceDoc[]
    },
    async entries (group, args, { dataSources, allowUser, user, logger }) {
      allowUser.group(group).getEntries.assert()
      logger.debug({ isDevice: isDevice(user) }, 'is device')

      const entries = await dataSources.entries.findManyByQuery(c => c.where('groupId', '==', group.id))

      return entries
    },
    async entry (group, { entryId }, { dataSources, allowUser, user, logger }) {
      const entry = await dataSources.entries.findOneById(entryId)
      allowUser.group(group).entry(entry).get.assert()

      return entry ?? null
    }
  }
}
