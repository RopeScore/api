import { ApolloError } from 'apollo-server-express'
import { isDevice, isGroup, isUser, JudgeDoc } from '../store/schema'
import { FieldValue, Timestamp } from '@google-cloud/firestore'
import type { Resolvers } from '../generated/graphql'
import type { DeviceDoc, GroupDoc, UserDoc } from '../store/schema'
import { Ttl } from '../config'
import { pubSub, RsEvents } from '../services/pubsub'
import { ID } from 'graphql-ws'
import { ApolloContext } from '../apollo'
import { withFilter } from 'graphql-subscriptions'

export const groupResolvers: Resolvers = {
  Query: {
    async group (_, { groupId }, { dataSources, allowUser, user }) {
      const group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      if (!group) return null
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, judge).get.assert()
      return group ?? null
    },
    async groups (_, args, { dataSources, user, allowUser }) {
      allowUser.getGroups.assert()
      if (!user) return []
      if (isDevice(user)) {
        const judges = await dataSources.judges.findManyByDevice(user.id, { ttl: Ttl.Short })
        return (await dataSources.groups.findManyByIds(judges.map(j => j.groupId))).filter(g => isGroup(g)).filter(g => !g?.completedAt) as GroupDoc[]
      } else if (user.globalAdmin) {
        return (await dataSources.groups.findAll({ ttl: Ttl.Short })) ?? []
      } else {
        return (await dataSources.groups.findManyByUser(user, { ttl: Ttl.Short })) ?? []
      }
    }
  },
  Mutation: {
    async createGroup (_, { data }, { dataSources, user, allowUser }) {
      allowUser.group(undefined, undefined).create.assert()
      user = user as UserDoc | DeviceDoc
      const group = await dataSources.groups.createOne({
        name: data.name, // TODO: prevent XSS
        admins: [user.id],
        viewers: [],
        createdAt: Timestamp.now()
      }, { ttl: Ttl.Short }) as GroupDoc
      return group
    },
    async updateGroup (_, { groupId, data }, { dataSources, allowUser, user }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()
      group = group as GroupDoc

      return await dataSources.groups.updateOnePartial(groupId, { name: data.name }) as GroupDoc
    },
    async toggleGroupComplete (_, { groupId, completed }, { dataSources, allowUser, user }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).toggleComplete.assert()
      group = group as GroupDoc

      return await dataSources.groups.updateOnePartial(groupId, {
        completedAt: completed ? group.completedAt ?? Timestamp.now() : FieldValue.delete()
      }) as GroupDoc
    },

    async addGroupAdmin (_, { groupId, userId }, { dataSources, allowUser, user }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()
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
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()
      group = group as GroupDoc

      if (userId === user?.id) throw new ApolloError('You cannot remove your own admin status')
      const vIdx = group.viewers.indexOf(userId)
      if (vIdx === -1) throw new ApolloError('Admin not part of group')

      return await dataSources.groups.updateOnePartial(group.id, {
        admins: FieldValue.arrayRemove(userId)
      }) as GroupDoc
    },
    async addGroupViewer (_, { groupId, userId }, { dataSources, allowUser, user }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()
      group = group as GroupDoc

      if (group.admins.includes(userId)) throw new ApolloError('Viewer is already admin')
      if (group.viewers.includes(userId)) throw new ApolloError('Viewer already in group')

      const addUser = await dataSources.users.findOneById(userId, { ttl: Ttl.Short })
      if (!addUser) throw new ApolloError(`user ${userId} not found`)

      return await dataSources.groups.updateOnePartial(group.id, {
        viewers: FieldValue.arrayUnion(userId)
      }) as GroupDoc
    },
    async removeGroupViewer (_, { groupId, userId }, { dataSources, allowUser, user }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()
      group = group as GroupDoc

      const vIdx = group.viewers.indexOf(userId)
      if (vIdx === -1) throw new ApolloError('Viewer not part of group')

      group.viewers.splice(vIdx, 1)
      return await dataSources.groups.updateOnePartial(group.id, {
        viewers: FieldValue.arrayRemove(userId)
      }) as GroupDoc
    },

    async setCurrentHeat (_, { groupId, heat }, { dataSources, allowUser, user }) {
      const group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()

      await pubSub.publish(RsEvents.HEAT_CHANGED, { groupId, heat })

      return await dataSources.groups.updateOnePartial(groupId, {
        currentHeat: heat
      }) as GroupDoc
    }
  },
  Subscription: {
    heatChanged: {
      // @ts-expect-error
      subscribe: withFilter(
        () => pubSub.asyncIterator([RsEvents.HEAT_CHANGED]),
        async (payload: { groupId: ID, heat: number }, variables: { groupId: ID }, { allowUser, dataSources, logger, user }: ApolloContext) => {
          try {
            // if we haven't even asked for it we can just skip it
            if (variables.groupId !== payload.groupId) return false

            // If we've asked for it we need read access on the group
            const group = await dataSources.groups.findOneById(payload.groupId, { ttl: Ttl.Short })
            const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: payload.groupId }, { ttl: Ttl.Short })
            const allow = allowUser.group(group, judge).get()

            return allow
          } catch (err) {
            logger.error(err)
            return false
          }
        }
      ),
      resolve: (payload: { groupId: ID, heat: number }) => payload.heat
    }
  },
  Group: {
    async admins (group, args, { dataSources, allowUser, user }) {
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).getUsers.assert()
      const admins = await dataSources.users.findManyByIds(group.admins, { ttl: Ttl.Short })
      return admins.filter(u => !!u) as UserDoc[]
    },
    async viewers (group, args, { dataSources, allowUser, user }) {
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).getUsers.assert()
      return (await dataSources.users.findManyByIds(group.viewers, { ttl: Ttl.Short }))
        .filter(u => isUser(u)) as UserDoc[]
    },
    async judges (group, args, { dataSources, allowUser, user }) {
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).getUsers.assert()

      const judges = await dataSources.judges.findManyByGroup(group, { ttl: Ttl.Long })

      return judges.filter(j => !!j)
    },
    async deviceJudge (group, args, { dataSources, allowUser, user }) {
      if (!isDevice(user)) throw new ApolloError('deviceJudge can only be accessed by devices')
      const judge = await dataSources.judges.findOneByDevice({ deviceId: user.id, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).judge(judge).get.assert()

      return judge as JudgeDoc
    },

    async categories (group, args, { dataSources, allowUser, user }) {
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).get.assert()
      return await dataSources.categories.findManyByGroup(group, { ttl: Ttl.Short })
    },
    async category (group, { categoryId }, { dataSources, allowUser, user }) {
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      const category = await dataSources.categories.findOneById(categoryId, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).get.assert()

      return category!
    },

    async entries (group, args, { dataSources, allowUser, user, logger }) {
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).get.assert()
      logger.debug({ isDevice: isDevice(user) }, 'is device')

      const categories = await dataSources.categories.findManyByGroup(group, { ttl: Ttl.Short })
      const entries = await dataSources.entries.findManyByCategories(categories.map(c => c.id))

      // TODO: if device, filter by judge assignments?

      return entries
    },
    async entry (group, { entryId }, { dataSources, allowUser, user, logger }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new ApolloError('Entry does not exist')
      const category = await dataSources.categories.findOneById(entry?.categoryId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).entry(entry).get.assert()

      // TODO: if device, filter by judge assignments?

      return entry ?? null
    },
    async entriesByHeat (group, { heat }, { dataSources, allowUser, user, logger }) {
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).get.assert()
      logger.debug({ isDevice: isDevice(user) }, 'is device')

      // TODO: if device, filter by judge assignments?

      const categories = await dataSources.categories.findManyByGroup(group, { ttl: Ttl.Short })
      const entries = await dataSources.entries.findManyByHeat({
        categoryIds: categories.map(c => c.id),
        heat
      })

      return entries
    }
  }
}
