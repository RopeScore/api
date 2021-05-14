import { ApolloError } from 'apollo-server'
import { isUser } from '../store/schema'
import type { Resolvers } from '../generated/graphql'
import type { DeviceDoc, GroupDoc, UserDoc } from '../store/schema'

export const groupResolvers: Resolvers = {
  Query: {
    async getGroup (_, { id }, { dataSources, allowUser }) {
      const group = await dataSources.groups.findOneById(id, { ttl: 60 })
      allowUser.group(group).get.assert()
      return group ?? null
    },
    async getGroups (_, args, { dataSources, user, allowUser }) {
      allowUser.getGroups.assert()
      if (!user) return []
      return (await dataSources.groups.findManyByUser(user, { ttl: 60 })) ?? []
    }
  },
  Mutation: {
    async createGroup (_, { name }, { dataSources, user, allowUser }) {
      allowUser.createGroup.assert()
      user = user as UserDoc | DeviceDoc
      return (await dataSources.groups.createOne({
        name,
        admin: user.id,
        viewers: []
      }, { ttl: 60 })) ?? null
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
    async scoresheets (group, args, { dataSources, allowUser }) {
      allowUser.group(group).getScoresheets.assert()
      return await dataSources.scoresheets.findManyByGroupId(group.id, { ttl: 60 })
    },
    async devices (group, args, { dataSources, allowUser }) {
      allowUser.group(group).getDevices.assert()
      return await dataSources.devices.findManyByGroupId(group.id, { ttl: 60 })
    }
  }
}
