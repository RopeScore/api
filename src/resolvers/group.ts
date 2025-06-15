import { type HeatChangedEventObj, isDevice, isGroup, isUser, type GroupDoc, ResultVisibilityLevel } from '../store/schema'
import { FieldValue, Timestamp } from '@google-cloud/firestore'
import type { Resolvers, SubscriptionHeatChangedArgs } from '../generated/graphql'
import { Ttl } from '../config'
import { pubSub, RsEvents } from '../services/pubsub'
import { type ApolloContext } from '../apollo'
import { withFilter } from 'graphql-subscriptions'
import { AuthorizationError, NotFoundError, ValidationError } from '../errors'
import { auth } from 'firebase-admin'
import { logger } from '../services/logger'

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
    },
  },
  Mutation: {
    async createGroup (_, { data }, { dataSources, user, allowUser }) {
      allowUser.group(undefined, undefined).create.assert()
      user = user!
      const group = (await dataSources.groups.createOne({
        name: data.name, // TODO: prevent XSS
        resultVisibility: data.resultVisibility ?? ResultVisibilityLevel.Private,
        admins: [user.id],
        viewers: [],
      }, { ttl: Ttl.Short }))!
      return group
    },
    async updateGroup (_, { groupId, data }, { dataSources, allowUser, user }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()
      group = group!

      return (await dataSources.groups.updateOnePartial(groupId, {
        name: data.name,
        ...(data.resultVisibility != null
          ? { resultVisibility: data.resultVisibility }
          : {}
        ),
      }))!
    },
    async toggleGroupComplete (_, { groupId, completed }, { dataSources, allowUser, user }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).toggleComplete.assert()
      group = group!

      return (await dataSources.groups.updateOnePartial(groupId, {
        completedAt: completed ? group.completedAt ?? Timestamp.now() : FieldValue.delete(),
      }))!
    },

    async addGroupAdmin (_, { groupId, userId: _userId, username }, { dataSources, allowUser, user }) {
      let userId = _userId

      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()
      group = group!

      if (userId != null) {
        const addUser = await dataSources.users.findOneById(userId, { ttl: Ttl.Short })
        if (addUser == null) throw new NotFoundError(`user ${userId} not found`)
      } else if (username != null) {
        let firebaseUser
        try {
          firebaseUser = await auth().getUserByEmail(username)
        } catch (err) {
          logger.error({ err })
          if (firebaseUser == null) throw new NotFoundError(`User ${username} not found`)
        }

        const user = await dataSources.users.findOneByFirebaseAuthId(firebaseUser.uid, { ttl: Ttl.Short })
        if (user == null) throw new NotFoundError(`User ${username} not found`)
        userId = user.id
      } else {
        throw new ValidationError('Either user ID or user email must be provided')
      }

      if (group.admins.includes(userId)) throw new ValidationError('User is already admin')

      return (await dataSources.groups.updateOnePartial(group.id, {
        admins: FieldValue.arrayUnion(userId),
        viewers: FieldValue.arrayRemove(userId),
      }))!
    },
    async removeGroupAdmin (_, { groupId, userId }, { dataSources, allowUser, user }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()
      group = group!

      if (userId === user?.id) throw new ValidationError('You cannot remove your own admin status')
      const vIdx = group.viewers.indexOf(userId)
      if (vIdx === -1) throw new NotFoundError('Admin not part of group')

      return (await dataSources.groups.updateOnePartial(group.id, {
        admins: FieldValue.arrayRemove(userId),
      }))!
    },
    async addGroupViewer (_, { groupId, userId: _userId, username }, { dataSources, allowUser, user }) {
      let userId = _userId
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()
      group = group!

      if (userId != null) {
        const addUser = await dataSources.users.findOneById(userId, { ttl: Ttl.Short })
        if (addUser == null) throw new NotFoundError(`user ${userId} not found`)
      } else if (username != null) {
        let firebaseUser
        try {
          firebaseUser = await auth().getUserByEmail(username)
        } catch (err) {
          logger.error({ err })
          if (firebaseUser == null) throw new NotFoundError(`User ${username} not found`)
        }

        const user = await dataSources.users.findOneByFirebaseAuthId(firebaseUser.uid, { ttl: Ttl.Short })
        if (user == null) throw new NotFoundError(`User ${username} not found`)
        userId = user.id
      } else {
        throw new ValidationError('Either user ID or user email must be provided')
      }

      if (group.admins.includes(userId)) throw new ValidationError('Viewer is already admin')
      if (group.viewers.includes(userId)) throw new ValidationError('Viewer already in group')

      return (await dataSources.groups.updateOnePartial(group.id, {
        viewers: FieldValue.arrayUnion(userId),
      }))!
    },
    async removeGroupViewer (_, { groupId, userId }, { dataSources, allowUser, user }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()
      group = group!

      const vIdx = group.viewers.indexOf(userId)
      if (vIdx === -1) throw new ValidationError('Viewer not part of group')

      group.viewers.splice(vIdx, 1)
      return (await dataSources.groups.updateOnePartial(group.id, {
        viewers: FieldValue.arrayRemove(userId),
      }))!
    },

    async setCurrentHeat (_, { groupId, heat }, { dataSources, allowUser, user }) {
      const group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).update.assert()

      const updated = (await dataSources.groups.updateOnePartial(groupId, {
        currentHeat: heat,
      }))!

      await dataSources.groups.deleteFromCacheById(updated.id)

      await pubSub.publish(RsEvents.HEAT_CHANGED, { groupId, heat } satisfies HeatChangedEventObj)

      return updated
    },
  },
  Subscription: {
    heatChanged: {
      // @ts-expect-error graphql-subscriptions has wrong types
      subscribe: withFilter<HeatChangedEventObj, SubscriptionHeatChangedArgs>(
        () => pubSub.asyncIterableIterator<HeatChangedEventObj>([RsEvents.HEAT_CHANGED], { onlyNew: true }),
        async (payload, variables, { allowUser, dataSources, logger, user }: ApolloContext) => {
          try {
            if (payload == null || variables == null) return false
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
      resolve: (payload: HeatChangedEventObj) => payload.heat,
    },
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
          categoryIds: categories.map(c => c.id),
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
          competitionEventId: entry.competitionEventId,
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
        heat,
      })

      if (isDevice(user)) {
        const judge = await dataSources.judges.findOneByDevice({ deviceId: user.id, groupId: group.id })
        if (!judge) throw new NotFoundError('Judge not found')
        const assignments = await dataSources.judgeAssignments.findManyByJudge({
          judgeId: judge.id,
          categoryIds: categories.map(c => c.id),
        })

        return entries.filter(entry => assignments.some(a =>
          a.competitionEventId === entry.competitionEventId &&
          a.categoryId === entry.categoryId &&
          (a.pool != null ? a.pool === entry.pool : true)
        ))
      }

      return entries
    },
  },
}
