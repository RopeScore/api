import { FieldValue, Timestamp } from '@google-cloud/firestore'
import { ApolloError } from 'apollo-server-express'
import { Ttl } from '../config'
import type { Resolvers } from '../generated/graphql'
import { EntryDoc, GroupDoc, isDevice, JudgeDoc, ParticipantDoc } from '../store/schema'

export const entryResolvers: Resolvers = {
  Mutation: {
    async createEntry (_, { categoryId, participantId, data }, { dataSources, allowUser }) {
      const category = await dataSources.categories.findOneById(categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).entry().create.assert()

      const exists = await dataSources.entries.findManyByQuery(c => c
        .where('categoryId', '==', categoryId)
        .where('participantId', '==', participantId)
        .where('competitionEventLookupCode', '==', data.competitionEventLookupCode)
      )

      if (exists.length) return exists[0]

      const { pool, heat, ...entryWithoutPool } = data

      const createdEntry = await dataSources.entries.createOne({
        categoryId,
        participantId,
        ...entryWithoutPool,
        ...(typeof heat === 'number' ? { heat } : {}),
        ...(typeof pool === 'number' ? { pool } : {})
      }) as EntryDoc
      return createdEntry
    },
    async setEntryDidNotSkip (_, { entryId, didNotSkip }, { allowUser, dataSources }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).entry(entry).update.assert()

      const now = Timestamp.now()
      return dataSources.entries.updateOnePartial(entryId, {
        didNotSkipAt: didNotSkip ? now : FieldValue.delete() as unknown as Timestamp
      }) as Promise<EntryDoc>
    },
    async toggleEntryLock (_, { entryId, lock }, { allowUser, dataSources }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).entry(entry).toggleLock.assert()

      const now = Timestamp.now()
      return await dataSources.entries.updateOnePartial(entryId, {
        didNotSkipAt: lock ? entry.lockedAt ?? now : FieldValue.delete() as unknown as Timestamp
      }) as EntryDoc
    },
    async reorderEntry (_, { entryId, heat, pool }, { allowUser, dataSources }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).entry(entry).update.assert()

      return await dataSources.entries.updateOnePartial(entryId, {
        heat: heat ?? FieldValue.delete(),
        pool: pool ?? FieldValue.delete()
      }) as EntryDoc
    }
  },
  Entry: {
    async category (entry, args, { dataSources, allowUser }) {
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).get.assert()
      return category
    },
    async participant (entry, args, { dataSources, allowUser }) {
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).entry(entry).get.assert()

      return await dataSources.participants.findOneById(entry.participantId) as ParticipantDoc
    },

    async scoresheets (entry, args, { dataSources, allowUser, user, logger }) {
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      let group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).entry(entry).get.assert()
      group = group as GroupDoc

      const now = Timestamp.now()
      logger.debug({ isDevice: isDevice(user) }, 'is device')
      let judge: JudgeDoc | undefined
      if (isDevice(user)) {
        judge = await dataSources.judges.findOneByDevice({ deviceId: user.id, groupId: group.id }, { ttl: Ttl.Short })
        if (!judge) throw new ApolloError('Current device is not assigned to a judge')
        logger.debug({ judgeId: judge.id, deviceId: user.id }, 'device is a judge')
      }

      const scoresheets = await dataSources.scoresheets.findManyByEntryJudge({
        judgeId: judge?.id,
        entryId: entry.id
      })

      if (judge) {
        logger.debug({ readTime: now }, 'Updating device scoresheet read time')
        await dataSources.judges.updateOnePartial(judge.id, { scoresheetsLastFetchedAt: now })
      }

      return scoresheets
    },
    async scoresheet (entry, { scoresheetId }, { dataSources, allowUser }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      return scoresheet ?? null
    },
    async deviceScoresheet (entry, _, { dataSources, allowUser, user }) {
      if (!isDevice(user)) throw new ApolloError('deviceScoresheet can only be accessed by devices')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      if (!group) throw new ApolloError('group not found')

      const judge = await dataSources.judges.findOneByDevice({ deviceId: user.id, groupId: group.id }, { ttl: Ttl.Short })
      if (!judge) throw new ApolloError('Current device is not assigned to a judge')
      const scoresheet = await dataSources.scoresheets.findOneByEntryJudge({
        judgeId: judge.id,
        entryId: entry.id
      })

      allowUser.group(group).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      if (!scoresheet) return null
      return scoresheet
    }
  }
}
