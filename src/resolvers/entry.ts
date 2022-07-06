import { FieldValue, Timestamp } from '@google-cloud/firestore'
import { ApolloError } from 'apollo-server-express'
import { Ttl } from '../config'
import type { Resolvers } from '../generated/graphql'
import { EntryDoc, GroupDoc, isDevice, ParticipantDoc } from '../store/schema'

export const entryResolvers: Resolvers = {
  Mutation: {
    async createEntry (_, { categoryId, participantId, data }, { dataSources, allowUser, user }) {
      const category = await dataSources.categories.findOneById(categoryId)
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      allowUser.group(group, judge).category(category).entry(undefined).create.assert()

      const exists = await dataSources.entries.findOneByParticipantEvent({
        categoryId,
        participantId,
        competitionEventId: data.competitionEventId
      })
      if (exists) {
        if (typeof data.heat === 'number') {
          return await dataSources.entries.updateOnePartial(exists.id, {
            ...(typeof data.heat === 'number' ? { heat: data.heat } : {}),
            ...(typeof data.heat === 'number' && typeof data.pool === 'number' ? { pool: data.pool } : {})
          }) as EntryDoc
        } else return exists
      }

      const { pool, heat, ...entryWithoutPool } = data

      return await dataSources.entries.createOne({
        categoryId,
        participantId,
        ...entryWithoutPool,
        ...(typeof heat === 'number' ? { heat } : {}),
        ...(typeof heat === 'number' && typeof pool === 'number' ? { pool } : {})
      }) as EntryDoc
    },
    async toggleEntryLock (_, { entryId, lock, didNotSkip }, { allowUser, dataSources, user }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      allowUser.group(group, judge).category(category).entry(entry).toggleLock.assert()

      const now = Timestamp.now()
      return await dataSources.entries.updateOnePartial(entryId, lock
        ? {
            lockedAt: now,
            ...(didNotSkip ? { didNotSkipAt: now } : {})
          }
        : {
            lockedAt: FieldValue.delete(),
            didNotSkipAt: FieldValue.delete()
          }
      ) as EntryDoc
    },
    async reorderEntry (_, { entryId, heat, pool }, { allowUser, dataSources, user }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      allowUser.group(group, judge).category(category).entry(entry).update.assert()

      return await dataSources.entries.updateOnePartial(entryId, {
        heat: heat ?? FieldValue.delete(),
        pool: heat != null ? pool ?? FieldValue.delete() : FieldValue.delete()
      }) as EntryDoc
    }
  },
  Entry: {
    async category (entry, args, { dataSources, allowUser, user }) {
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).get.assert()
      return category
    },
    async participant (entry, args, { dataSources, allowUser, user }) {
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).entry(entry).get.assert()

      return await dataSources.participants.findOneById(entry.participantId) as ParticipantDoc
    },

    async scoresheets (entry, args, { dataSources, allowUser, user, logger }) {
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      let group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }) // no TTL as we do an update on the judge
      allowUser.group(group, judge).category(category).entry(entry).get.assert()
      group = group as GroupDoc

      const now = Timestamp.now()
      logger.debug({ isDevice: isDevice(user) }, 'is device')
      if (isDevice(user)) {
        if (!judge) throw new ApolloError('Current device is not assigned to a judge')
        logger.debug({ judgeId: judge.id, deviceId: user.id }, 'device is a judge')
      }

      const scoresheets = await dataSources.scoresheets.findManyByEntryJudge({
        judgeId: judge?.id,
        entryId: entry.id,
        deviceId: isDevice(user) ? user.id : undefined
      })

      if (judge) {
        logger.debug({ readTime: now }, 'Updating device scoresheet read time')
        await dataSources.judges.updateOnePartial(judge.id, { scoresheetsLastFetchedAt: now })
      }

      // Sort so the latest one is last
      return scoresheets.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())
    },
    async scoresheet (entry, { scoresheetId }, { dataSources, allowUser, user }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      return scoresheet ?? null
    }
  }
}
