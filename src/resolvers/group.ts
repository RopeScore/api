import { isDevice, isGroup, isUser, type DeviceDoc, type GroupDoc, type UserDoc, ResultVisibilityLevel } from '../store/schema'
import { FieldValue, Timestamp } from '@google-cloud/firestore'
import type { Resolvers } from '../generated/graphql'
import { Ttl } from '../config'
import { pubSub, RsEvents } from '../services/pubsub'
import { type ID } from 'graphql-ws'
import { type ApolloContext } from '../apollo'
import { withFilter } from 'graphql-subscriptions'
import { AuthorizationError, NotFoundError, ValidationError } from '../errors'

export const groupResolvers: Resolvers = {
  Query: {
    async group (_, { groupId }, { dataSources, allowUser, user }) {
      const group = await dataSources.groups.findOneById(groupId)
      if (!group) return null
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, judge).get.assert()
      return group ?? null
    },
    async groups (_, args, { dataSources, user, allowUser }) {
      allowUser.getGroups.assert()
      let groups: GroupDoc[] = []
      if (!user) groups = []
      else if (isDevice(user)) {
        const judges = await dataSources.judges.findManyByDevice(user.id, { ttl: Ttl.Short })
        groups = (await dataSources.groups.findManyByIds(judges.map(j => j.groupId))).filter(g => isGroup(g)).filter(g => !g?.completedAt)
      } else if (user.globalAdmin) {
        groups = (await dataSources.groups.findAll({ ttl: Ttl.Short })) ?? []
      } else {
        groups = (await dataSources.groups.findManyByUser(user, { ttl: Ttl.Short })) ?? []
      }

      return groups.sort((a: GroupDoc, b: GroupDoc) => {
        // Place non-completed before the completed ones
        if ((a.completedAt != null) !== (b.completedAt != null)) return (a.completedAt != null ? 1 : 0) - (b.completedAt != null ? 1 : 0)
        // Among the completed ones (we can assume both are completed because
        // of the previous statement)
        // Sort the newest one first and the oldest one last
        if (a.completedAt != null) return b.createdAt.toMillis() - a.createdAt.toMillis()
        // But among the uncompleted ones, sort the oldest ones first and the
        // newest ones last
        return a.createdAt.toMillis() - b.createdAt.toMillis()
      })
    }
  },
  Mutation: {
    async createGroup (_, { data }, { dataSources, user, allowUser }) {
      allowUser.group(undefined, undefined).create.assert()
      user = user as UserDoc | DeviceDoc
      const group = await dataSources.groups.createOne({
        name: data.name, // TODO: prevent XSS
        resultVisibility: data.resultVisibility ?? ResultVisibilityLevel.Private,
        admins: [user.id],
        viewers: []
      }, { ttl: Ttl.Short }) as GroupDoc
      return group
    },
    async updateGroup (_, { groupId, data }, { dataSources, allowUser, user }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()
      group = group as GroupDoc

      return await dataSources.groups.updateOnePartial(groupId, {
        name: data.name,
        ...(data.resultVisibility != null
          ? { resultVisibility: data.resultVisibility }
          : {}
        )
      }) as GroupDoc
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

      if (group.admins.includes(userId)) throw new ValidationError('User is already admin')

      const addUser = await dataSources.users.findOneById(userId, { ttl: Ttl.Short })
      if (!addUser) throw new NotFoundError(`user ${userId} not found`)

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

      if (userId === user?.id) throw new ValidationError('You cannot remove your own admin status')
      const vIdx = group.viewers.indexOf(userId)
      if (vIdx === -1) throw new NotFoundError('Admin not part of group')

      return await dataSources.groups.updateOnePartial(group.id, {
        admins: FieldValue.arrayRemove(userId)
      }) as GroupDoc
    },
    async addGroupViewer (_, { groupId, userId }, { dataSources, allowUser, user }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()
      group = group as GroupDoc

      if (group.admins.includes(userId)) throw new ValidationError('Viewer is already admin')
      if (group.viewers.includes(userId)) throw new ValidationError('Viewer already in group')

      const addUser = await dataSources.users.findOneById(userId, { ttl: Ttl.Short })
      if (!addUser) throw new NotFoundError(`user ${userId} not found`)

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
      if (vIdx === -1) throw new ValidationError('Viewer not part of group')

      group.viewers.splice(vIdx, 1)
      return await dataSources.groups.updateOnePartial(group.id, {
        viewers: FieldValue.arrayRemove(userId)
      }) as GroupDoc
    },

    async setCurrentHeat (_, { groupId, heat }, { dataSources, allowUser, user }) {
      const group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()

      const updated = await dataSources.groups.updateOnePartial(groupId, {
        currentHeat: heat
      }) as GroupDoc

      await dataSources.groups.deleteFromCacheById(updated.id)

      await pubSub.publish(RsEvents.HEAT_CHANGED, { groupId, heat })

      return updated
    }
  },
  Subscription: {
    heatChanged: {
      // @ts-expect-error graphql-subscriptions has wrong types
      subscribe: withFilter(
        () => pubSub.asyncIterator([RsEvents.HEAT_CHANGED], { onlyNew: true }),
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
      return admins.filter(u => !!u)
    },
    async viewers (group, args, { dataSources, allowUser, user }) {
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).getUsers.assert()
      return (await dataSources.users.findManyByIds(group.viewers, { ttl: Ttl.Short }))
        .filter(u => isUser(u))
    },
    async judges (group, args, { dataSources, allowUser, user }) {
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).getUsers.assert()

      const judges = await dataSources.judges.findManyByGroup(group, { ttl: Ttl.Long })

      return judges.filter(j => !!j)
    },
    async deviceJudge (group, args, { dataSources, allowUser, user }) {
      if (!isDevice(user)) throw new AuthorizationError('deviceJudge can only be accessed by devices')
      const judge = await dataSources.judges.findOneByDevice({ deviceId: user.id, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).judge(judge).get.assert()

      return judge!
    },

    async categories (group, args, { dataSources, allowUser, user }) {
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).listCategories.assert()
      return await dataSources.categories.findManyByGroup(group, { ttl: Ttl.Short })
    },
    async category (group, { categoryId }, { dataSources, allowUser, user }) {
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      const category = await dataSources.categories.findOneById(categoryId, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).get.assert()

      return category ?? null
    },

    async entries (group, args, { dataSources, allowUser, user, logger }) {
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).listEntries.assert()
      logger.debug({ isDevice: isDevice(user) }, 'is device')

      const categories = await dataSources.categories.findManyByGroup(group, { ttl: Ttl.Short })
      const entries = await dataSources.entries.findManyByCategories(categories.map(c => c.id))

      if (isDevice(user)) {
        const judge = await dataSources.judges.findOneByDevice({ deviceId: user.id, groupId: group.id })
        if (!judge) throw new NotFoundError('Judge not found')
        const assignments = await dataSources.judgeAssignments.findManyByJudge({
          judgeId: judge.id,
          categoryIds: categories.map(c => c.id)
        })

        return entries.filter(entry => assignments.some(a =>
          a.competitionEventId === entry.competitionEventId &&
          a.categoryId === entry.categoryId &&
          (a.pool != null ? a.pool === entry.pool : true)
        ))
      }

      return entries
    },
    async entry (group, { entryId }, { dataSources, allowUser, user, logger }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new NotFoundError('Entry does not exist')
      const category = await dataSources.categories.findOneById(entry?.categoryId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).entry(entry).get.assert()

      if (isDevice(user)) {
        const judge = await dataSources.judges.findOneByDevice({ deviceId: user.id, groupId: group.id })
        if (!judge) throw new NotFoundError('Judge not found')
        const assignment = await dataSources.judgeAssignments.findOneByJudge({
          judgeId: judge.id,
          categoryId: entry.categoryId,
          competitionEventId: entry.competitionEventId
        })
        if (!assignment) throw new AuthorizationError('You are not assigned to this entry')
        if (assignment.pool != null && assignment.pool !== entry.pool) throw new AuthorizationError('You are not assigned to this entry')
      }

      return entry ?? null
    },
    async entriesByHeat (group, { heat }, { dataSources, allowUser, user, logger }) {
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).listEntries.assert()
      logger.debug({ isDevice: isDevice(user) }, 'is device')

      const categories = await dataSources.categories.findManyByGroup(group, { ttl: Ttl.Short })
      const entries = await dataSources.entries.findManyByHeat({
        categoryIds: categories.map(c => c.id),
        heat
      })

      if (isDevice(user)) {
        const judge = await dataSources.judges.findOneByDevice({ deviceId: user.id, groupId: group.id })
        if (!judge) throw new NotFoundError('Judge not found')
        const assignments = await dataSources.judgeAssignments.findManyByJudge({
          judgeId: judge.id,
          categoryIds: categories.map(c => c.id)
        })

        return entries.filter(entry => assignments.some(a =>
          a.competitionEventId === entry.competitionEventId &&
          a.categoryId === entry.categoryId &&
          (a.pool != null ? a.pool === entry.pool : true)
        ))
      }

      return entries
    }
  }
}
