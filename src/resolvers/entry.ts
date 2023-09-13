import { FieldValue, Timestamp } from '@google-cloud/firestore'
import { withFilter } from 'graphql-subscriptions'
import { type ID } from 'graphql-ws'
import { type ApolloContext } from '../apollo'
import { Ttl } from '../config'
import type { Resolvers } from '../generated/graphql'
import { pubSub, RsEvents } from '../services/pubsub'
import { type EntryDoc, type GroupDoc, isDevice, type ParticipantDoc } from '../store/schema'
import { AuthorizationError, NotFoundError, ValidationError } from '../errors'
import { calculateResult } from '../services/results'

export const entryResolvers: Resolvers = {
  Mutation: {
    async createEntry (_, { categoryId, participantId, data }, { dataSources, allowUser, user }) {
      const category = await dataSources.categories.findOneById(categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      allowUser.group(group, judge).category(category).entry(undefined).create.assert()

      if (!category.competitionEventIds.includes(data.competitionEventId)) {
        throw new ValidationError('Cannot create entry for a competition event that\'s not enabled for this competition')
      }

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
    async toggleEntryLock (_, { entryId, lock, didNotSkip }, { allowUser, dataSources, user, logger }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new NotFoundError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      allowUser.group(group, judge).category(category).entry(entry).toggleLock.assert()

      const now = Timestamp.now()
      const updated = await dataSources.entries.updateOnePartial(entryId, lock
        ? {
            lockedAt: now,
            lockActionAt: now,
            ...(didNotSkip ? { didNotSkipAt: now } : {})
          }
        : {
            lockedAt: FieldValue.delete(),
            lockActionAt: now,
            didNotSkipAt: FieldValue.delete()
          }
      ) as EntryDoc

      calculateResult(category.id, entry.competitionEventId, { dataSources })
        .catch(err => {
          logger.error({ err }, 'Failed to calculate results in the background')
        })

      return updated
    },
    async reorderEntry (_, { entryId, heat, pool }, { allowUser, dataSources, user }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new NotFoundError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      allowUser.group(group, judge).category(category).entry(entry).reorder.assert()

      return await dataSources.entries.updateOnePartial(entryId, {
        heat: heat ?? FieldValue.delete(),
        pool: heat != null ? pool ?? FieldValue.delete() : FieldValue.delete()
      }) as EntryDoc
    }
  },
  Subscription: {
    scoresheetChanged: {
      // @ts-expect-error bad typing from graphql-subscriptions
      subscribe: withFilter(
        () => pubSub.asyncIterator([RsEvents.SCORESHEET_CHANGED], { onlyNew: true }),
        async (payload: { entryId: ID, scoresheetId: ID }, variables: { entryIds: ID[] }, { allowUser, dataSources, logger, user }: ApolloContext) => {
          try {
            // if we haven't even asked for it we can just skip it
            if (!variables.entryIds.includes(payload.entryId)) return false

            // If we've asked for it we need read access on the group
            const entry = await dataSources.entries.findOneById(payload.entryId, { ttl: Ttl.Short })
            if (!entry) return false
            const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
            if (!category) return false
            const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
            const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
            const allow = allowUser.group(group, judge).category(category).entry(entry).get()

            return allow
          } catch (err) {
            logger.error(err)
            return false
          }
        }
      ),
      resolve: (payload: { entryId: ID, scoresheetId: ID }) => payload.scoresheetId
    }
  },
  Entry: {
    async category (entry, args, { dataSources, allowUser, user }) {
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).get.assert()
      return category
    },
    async participant (entry, args, { dataSources, allowUser, user }) {
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).entry(entry).get.assert()

      return await dataSources.participants.findOneById(entry.participantId) as ParticipantDoc
    },

    async scoresheets (entry, args, { dataSources, allowUser, user, logger }) {
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new NotFoundError('Category not found')
      let group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }) // no TTL as we do an update on the judge
      allowUser.group(group, judge).category(category).entry(entry).get.assert()
      group = group as GroupDoc

      const now = Timestamp.now()
      logger.debug({ isDevice: isDevice(user) }, 'is device')
      if (isDevice(user)) {
        if (!judge) throw new AuthorizationError('Current device is not assigned to a judge')
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

      if (scoresheets.length === 0) return []

      const assignments = await dataSources.judgeAssignments.findManyByJudges({
        judgeIds: scoresheets.map(scsh => scsh.judgeId),
        competitionEventId: entry.competitionEventId,
        categoryId: category.id
      })

      // Sort so the latest one is last
      return scoresheets
        .filter(scsh => assignments.some(ja => ja.judgeId === scsh.judgeId && (ja.pool == null || ja.pool === entry.pool)))
        .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())
    },
    async scoresheet (entry, { scoresheetId }, { dataSources, allowUser, user }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      if (!judge) throw new NotFoundError('Judge not found')
      allowUser.group(group, judge).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      const assignment = await dataSources.judgeAssignments.findOneByJudge({
        judgeId: judge.id,
        categoryId: category.id,
        competitionEventId: entry.competitionEventId
      })
      if (!assignment) throw new AuthorizationError('The selected judge does not have an assignment in this category')
      if (assignment.pool != null && assignment.pool !== entry.pool) throw new AuthorizationError('The selected judge is not assigned to this pool')

      return scoresheet ?? null
    }
  }
}
