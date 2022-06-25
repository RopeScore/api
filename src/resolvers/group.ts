import { ApolloError } from 'apollo-server-express'
import { isDevice, isUser } from '../store/schema'
import { FieldValue, Timestamp } from '@google-cloud/firestore'
import type { Resolvers } from '../generated/graphql'
import type { DeviceDoc, GroupDoc, UserDoc } from '../store/schema'
import { Ttl } from '../config'

export const groupResolvers: Resolvers = {
  Query: {
    async group (_, { groupId }, { dataSources, allowUser }) {
      const group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      allowUser.group(group).get.assert()
      return group ?? null
    },
    async groups (_, args, { dataSources, user, allowUser }) {
      allowUser.getGroups.assert()
      if (!user) return []
      return (await dataSources.groups.findManyByUser(user, { ttl: Ttl.Short })) ?? []
    }
  },
  Mutation: {
    async createGroup (_, { data }, { dataSources, user, allowUser }) {
      allowUser.createGroup.assert()
      user = user as UserDoc | DeviceDoc
      const group = await dataSources.groups.createOne({
        name: data.name, // TODO: prevent XSS
        admins: [user.id],
        viewers: [],
        createdAt: Timestamp.now()
      }, { ttl: Ttl.Short }) as GroupDoc
      return group
    },
    async updateGroup (_, { groupId, data }, { dataSources, allowUser }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      allowUser.group(group).update.assert()
      group = group as GroupDoc

      return await dataSources.groups.updateOnePartial(groupId, { name: data.name }) as GroupDoc
    },
    async completeGroup (_, { groupId }, { dataSources, allowUser }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      allowUser.group(group).update.assert()
      group = group as GroupDoc

      return await dataSources.groups.updateOnePartial(groupId, { completedAt: Timestamp.now() }) as GroupDoc
    },

    async addGroupAdmin (_, { groupId, userId }, { dataSources, allowUser }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      allowUser.group(group).update.assert()
      group = group as GroupDoc

      if (group.admins.includes(userId)) throw new ApolloError('User is already admin')

      const addUser = await dataSources.users.findOneById(userId, { ttl: Ttl.Short })
      if (!addUser) throw new ApolloError(`user ${userId} not found`)

      return await dataSources.groups.updateOnePartial(group.id, {
        admins: FieldValue.arrayUnion(userId),
        viewers: FieldValue.arrayRemove(userId)
      }) as GroupDoc
    },
    async removeGroupAdmin (_, { groupId, userId }, { dataSources, allowUser, user }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      allowUser.group(group).update.assert()
      group = group as GroupDoc

      if (userId === user?.id) throw new ApolloError('You cannot remove your own admin status')
      const vIdx = group.viewers.indexOf(userId)
      if (vIdx === -1) throw new ApolloError('Admin not part of group')

      return await dataSources.groups.updateOnePartial(group.id, {
        admins: FieldValue.arrayRemove(userId)
      }) as GroupDoc
    },
    async addGroupViewer (_, { groupId, userId }, { dataSources, allowUser }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      allowUser.group(group).update.assert()
      group = group as GroupDoc

      if (group.admins.includes(userId)) throw new ApolloError('Viewer is already admin')
      if (group.viewers.includes(userId)) throw new ApolloError('Viewer already in group')

      const addUser = await dataSources.users.findOneById(userId, { ttl: Ttl.Short })
      if (!addUser) throw new ApolloError(`user ${userId} not found`)

      return await dataSources.groups.updateOnePartial(group.id, {
        viewers: FieldValue.arrayUnion(userId)
      }) as GroupDoc
    },
    async removeGroupViewer (_, { groupId, userId }, { dataSources, allowUser }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      allowUser.group(group).update.assert()
      group = group as GroupDoc

      const vIdx = group.viewers.indexOf(userId)
      if (vIdx === -1) throw new ApolloError('Viewer not part of group')

      group.viewers.splice(vIdx, 1)
      return await dataSources.groups.updateOnePartial(group.id, {
        viewers: FieldValue.arrayRemove(userId)
      }) as GroupDoc
    }
  },
  Group: {
    async admins (group, args, { dataSources, allowUser }) {
      allowUser.group(group).getUsers.assert()
      const admins = await dataSources.users.findManyByIds(group.admins, { ttl: Ttl.Short })
      return admins.filter(u => !!u) as UserDoc[]
    },
    async viewers (group, args, { dataSources, allowUser }) {
      allowUser.group(group).getUsers.assert()
      return (await dataSources.users.findManyByIds(group.viewers, { ttl: Ttl.Short }))
        .filter(u => isUser(u)) as UserDoc[]
    },
    async judges (group, args, { dataSources, allowUser }) {
      allowUser.group(group).getUsers.assert()

      const judges = await dataSources.judges.findManyByGroup(group, { ttl: Ttl.Long })

      return judges.filter(j => !!j)
    },

    async categories (group, args, { dataSources, allowUser }) {
      allowUser.group(group).get.assert()
      return await dataSources.categories.findManyByGroup(group, { ttl: Ttl.Short })
    },
    async category (group, { categoryId }, { dataSources, allowUser }) {
      const category = await dataSources.categories.findOneById(categoryId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).get.assert()

      return category!
    },

    async entries (group, args, { dataSources, allowUser, user, logger }) {
      allowUser.group(group).get.assert()
      logger.debug({ isDevice: isDevice(user) }, 'is device')

      const categories = await dataSources.categories.findManyByGroup(group, { ttl: Ttl.Short })
      const entries = await dataSources.entries.findManyByQuery(c => c.where('categoryId', 'in', categories.map(c => c.id)))

      // TODO: device filter by judge assignment?

      return entries
    },
    async entry (group, { entryId }, { dataSources, allowUser, user, logger }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new ApolloError('Entry does not exist')
      const category = await dataSources.categories.findOneById(entry?.categoryId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).entry(entry).get.assert()

      // TODO: device filter by judge assignment?

      return entry ?? null
    },
    async entriesByHeat (group, { heat }, { dataSources, allowUser, user, logger }) {
      allowUser.group(group).get.assert()
      logger.debug({ isDevice: isDevice(user) }, 'is device')

      // TODO: device filter by judge assignment?

      const categories = await dataSources.categories.findManyByGroup(group, { ttl: Ttl.Short })
      const entries = await dataSources.entries.findManyByQuery(c => c
        .where('categoryId', 'in', categories.map(c => c.id))
        .where('heat', '==', heat)
      )

      return entries
    }
  }
}
