import { FieldValue, Timestamp } from '@google-cloud/firestore'
import { withFilter } from 'graphql-subscriptions'
import { type ID } from 'graphql-ws'
import { type ApolloContext } from '../apollo'
import { Ttl } from '../config'

import type { Resolvers } from '../generated/graphql'
import { pubSub, RsEvents } from '../services/pubsub'
import { type DeviceDoc, type DeviceStreamMarkEventObj, isMarkScoresheet, isTallyScoresheet, isUser, type MarkScoresheetDoc, type ScoreTally, type TallyScoresheetDoc, validateMark } from '../store/schema'
import { addStreamMarkPermissionCache, streamMarkAddedPermissionCache, deviceStreamMarkAddedPermissionCache } from '../services/permissions'
import { AuthenticationError, AuthorizationError, NotFoundError, ValidationError } from '../errors'
import { type LibraryFields } from 'apollo-datasource-firestore/dist/helpers'

function isObject (x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function filterTally (tally: unknown) {
  if (!isObject(tally)) throw new ValidationError('Tally is not valid')
  const filteredTally = Object.fromEntries(Object.entries(tally).filter(([k, v]) => v != null)) as ScoreTally

  const invalidKeys = Object.entries(filteredTally).filter(([k, v]) => typeof k !== 'string' || typeof v !== 'number')
  if (invalidKeys.length > 0) {
    throw new ValidationError(`Tally is not valid, invalid keys: ${invalidKeys.join(', ')}`, { extensions: { invalidKeys } })
  }

  return filteredTally
}

export const scoresheetResolvers: Resolvers = {
  Mutation: {
    async createMarkScoresheet (_, { entryId, judgeId, data }, { allowUser, dataSources, user }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new NotFoundError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new NotFoundError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(undefined).create.assert()

      const judge = await dataSources.judges.findOneById(judgeId)
      if (!judge || judge.groupId !== group.id) throw new NotFoundError('Judge not found')
      const assignment = await dataSources.judgeAssignments.findOneByJudge({
        judgeId: judge.id,
        categoryId: category.id,
        competitionEventId: entry.competitionEventId,
      })
      if (!assignment) throw new ValidationError('The selected judge does not have an assignment in this category')
      if (assignment.pool != null && assignment.pool !== entry.pool) throw new ValidationError('The selected judge is not assigned to this pool')

      const created = await dataSources.scoresheets.createOne({
        entryId,
        judgeId,

        rulesId: category.rulesId,
        judgeType: assignment.judgeType,
        competitionEventId: entry.competitionEventId,
        deviceId: judge.deviceId,

        marks: [],
        options: {
          ...assignment.options,
          ...data.options,
        },
      } as Omit<MarkScoresheetDoc, keyof LibraryFields>) as MarkScoresheetDoc

      await pubSub.publish(RsEvents.SCORESHEET_CHANGED, { entryId, scoresheetId: created.id })

      return created
    },
    async createTallyScoresheet (_, { entryId, judgeId, data }, { allowUser, dataSources, user, logger }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new NotFoundError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new NotFoundError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(undefined).create.assert()

      const judge = await dataSources.judges.findOneById(judgeId)
      if (!judge || judge.groupId !== group.id) throw new NotFoundError('Judge not found')
      const assignment = await dataSources.judgeAssignments.findOneByJudge({
        judgeId: judge.id,
        categoryId: category.id,
        competitionEventId: entry.competitionEventId,
      })
      if (!assignment) throw new ValidationError('The selected judge does not have an assignment in this category')
      if (assignment.pool != null && assignment.pool !== entry.pool) throw new ValidationError('The selected judge is not assigned to this pool')

      let tally = {}
      if (data.tally) {
        if (!Object.entries(data.tally as Record<string, number>).every(([k, v]) => typeof k === 'string' && typeof v === 'number')) {
          logger.warn({ tally: data.tally }, 'Invalid incoming tally')
        } else {
          tally = data.tally
        }
      }

      const created = await dataSources.scoresheets.createOne({
        entryId,
        judgeId,

        rulesId: category.rulesId,
        judgeType: assignment.judgeType,
        competitionEventId: entry.competitionEventId,

        tally,
        options: {
          ...assignment.options,
          ...data.options,
        },
      } as Omit<TallyScoresheetDoc, keyof LibraryFields>) as TallyScoresheetDoc

      await pubSub.publish(RsEvents.SCORESHEET_CHANGED, { entryId, scoresheetId: created.id })

      return created
    },
    async setScoresheetOptions (_, { scoresheetId, options }, { allowUser, dataSources, user }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      if (!scoresheet) throw new NotFoundError('Scoresheet not found')
      const entry = await dataSources.entries.findOneById(scoresheet.entryId)
      if (!entry) throw new NotFoundError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new NotFoundError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).updateOptions.assert()

      scoresheet.options = options

      const updated = (await dataSources.scoresheets.updateOne(scoresheet))!

      await pubSub.publish(RsEvents.SCORESHEET_CHANGED, { entryId: entry.id, scoresheetId: updated.id })

      return updated
    },
    async setScoresheetExclusion (_, { scoresheetId, exclude }, { allowUser, dataSources, user }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      if (!scoresheet) throw new NotFoundError('Scoresheet not found')
      const entry = await dataSources.entries.findOneById(scoresheet.entryId)
      if (!entry) throw new NotFoundError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new NotFoundError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).updateOptions.assert()

      const updated = (await dataSources.scoresheets.updateOnePartial(scoresheet.id, {
        excludedAt: exclude ? Timestamp.now() : FieldValue.delete(),
      }))!

      await pubSub.publish(RsEvents.SCORESHEET_CHANGED, { entryId: entry.id, scoresheetId: updated.id })

      return updated
    },

    async fillTallyScoresheet (_, { scoresheetId, tally, programVersion }, { allowUser, dataSources, user }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      if (!scoresheet) throw new NotFoundError('Scoresheet not found')
      const entry = await dataSources.entries.findOneById(scoresheet.entryId)
      if (!entry) throw new NotFoundError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new NotFoundError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).fillTally.assert()
      if (!isTallyScoresheet(scoresheet)) throw new ValidationError('Scoresheet updates are not for a mark scoresheet')

      const filteredTally = filterTally(tally)

      // full update so we replace the whole tally

      return await dataSources.scoresheets.updateOne({
        ...scoresheet,
        tally: filteredTally,
        submitterProgramVersion: programVersion ?? null,
      } as TallyScoresheetDoc) as TallyScoresheetDoc
    },
    async fillMarkScoresheet (_, { scoresheetId, openedAt, completedAt, marks, programVersion }, { allowUser, dataSources, user }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      if (!scoresheet) throw new NotFoundError('Scoresheet not found')
      const entry = await dataSources.entries.findOneById(scoresheet.entryId)
      if (!entry) throw new NotFoundError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new NotFoundError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).fillMark.assert()

      const now = Timestamp.now()
      const updates: Partial<MarkScoresheetDoc> = {
        updatedAt: now,
        submitterProgramVersion: programVersion ?? null,
      }

      if (!openedAt && !marks && !completedAt) throw new ValidationError('Nothing to update')
      if (!isMarkScoresheet(scoresheet)) throw new ValidationError('Scoresheet updates are not for a mark scoresheet')

      if (openedAt) {
        if (!scoresheet.openedAt) scoresheet.openedAt = []
        scoresheet.openedAt.push(openedAt)
        updates.openedAt = scoresheet.openedAt
      }
      if (marks) {
        if (!scoresheet.openedAt?.length) throw new ValidationError('Cannot add marks before the scoresheet has been opened')
        // more input validation
        for (let idx = 0; idx < marks.length; idx++) {
          const mark = marks[idx]
          if (!mark) throw new ValidationError(`Invalid mark at index ${idx}`)
          if (typeof mark.sequence !== 'number' || mark.sequence !== idx) throw new ValidationError(`Mark sequence is broken at index ${idx}`)
          if (typeof mark.timestamp !== 'number' || (idx > 0 && marks[idx - 1]?.timestamp > mark.timestamp)) throw new ValidationError(`Mark at index ${idx} happens before mark ${idx - 1}`)
          if (typeof mark.schema !== 'string') throw new ValidationError(`no mark schema specified at index ${idx}`)
        }
        updates.marks = marks as MarkScoresheetDoc['marks']
      }
      if (completedAt) {
        if (!scoresheet.openedAt?.length) throw new ValidationError('Cannot complete an unopened scoresheet')
        updates.completedAt = completedAt
        updates.submittedAt = now
      }

      return await dataSources.scoresheets.updateOne({
        ...scoresheet,
        ...updates,
      }) as MarkScoresheetDoc
    },

    async addStreamMark (_, { scoresheetId, mark, tally }, { dataSources, logger, user }) {
      if (!user) throw new AuthenticationError('You must be logged in')
      const allowed = await addStreamMarkPermissionCache.fetch(`${isUser(user) ? 'u' : 'd'}::${user.id}::${scoresheetId}`, { allowStale: true, context: { dataSources, logger } })
      if (!allowed) throw new AuthorizationError('Permission denied')

      if (!mark) throw new ValidationError('Invalid mark')
      if (typeof mark.sequence !== 'number') throw new ValidationError('Missing Mark timestamp')
      if (typeof mark.timestamp !== 'number') throw new ValidationError('Missing Mark timestamp')
      if (typeof mark.schema !== 'string') throw new ValidationError('No mark schema specified')

      const filteredTally = filterTally(tally)

      const markEvent = {
        scoresheetId,
        sequence: mark.sequence,
        mark,
        tally: filteredTally,
      }

      await pubSub.publish(RsEvents.MARK_ADDED, markEvent)

      return markEvent
    },
    async addDeviceStreamMark (_, { mark, tally, info }, { dataSources, allowUser, user }) {
      allowUser.addDeviceMark.assert()

      validateMark(mark)

      const filteredTally = filterTally(tally)

      const markEvent: DeviceStreamMarkEventObj = {
        deviceId: (user as DeviceDoc).id,
        sequence: mark.sequence,
        mark,
        tally: filteredTally,
        ...(info != null ? { info } : {}),
      }

      await pubSub.publish(RsEvents.DEVICE_MARK_ADDED, markEvent)

      return markEvent
    },
  },
  Subscription: {
    streamMarkAdded: {
      // @ts-expect-error the types are wrong
      subscribe: withFilter(
        () => pubSub.asyncIterator([RsEvents.MARK_ADDED], { onlyNew: true }),
        async (payload: { scoresheetId: ID, [prop: string]: any }, variables: { scoresheetIds: ID[] }, { dataSources, user, logger }: ApolloContext) => {
          try {
            // if we haven't even asked for it we can just skip it
            if (!variables.scoresheetIds.includes(payload.scoresheetId)) return false

            if (!user) return false
            const allowed = await streamMarkAddedPermissionCache.fetch(`${isUser(user) ? 'u' : 'd'}::${user.id}::${payload.scoresheetId}`, { allowStale: true, context: { dataSources, logger } })
            return !!allowed
          } catch (err) {
            logger.error(err)
            return false
          }
        }
      ),
      resolve: (payload: any) => {
        if (!payload.tally) payload.tally = {}
        return payload
      },
    },
    deviceStreamMarkAdded: {
      // @ts-expect-error the types are wrong
      subscribe: withFilter(
        () => pubSub.asyncIterator([RsEvents.DEVICE_MARK_ADDED], { onlyNew: true }),
        async (payload: { deviceId: ID, [prop: string]: any }, variables: { deviceIds: ID[] }, { allowUser, dataSources, user, logger }: ApolloContext) => {
          try {
            // if we haven't even asked for it we can just skip it
            if (!variables.deviceIds.includes(payload.deviceId)) return false
            if (!isUser(user)) return false

            const allowed = await deviceStreamMarkAddedPermissionCache.fetch(`${user.id}::${payload.deviceId}`, { allowStale: true, context: { dataSources, logger } })
            return !!allowed
          } catch (err) {
            logger.error(err)
            return false
          }
        }
      ),
      resolve: (payload: any) => {
        if (!payload.tally) payload.tally = {}
        if (!payload.info) payload.info = {}
        return payload
      },
    },
  },
  MarkScoresheet: {
    deletedAt (scoresheet) {
      return scoresheet.excludedAt ?? null
    },
    async device (scoresheet, args, { dataSources, allowUser, user }) {
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: Ttl.Short })
      if (!entry) throw new NotFoundError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      if (!group) throw new NotFoundError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      const device = await dataSources.devices.findOneById(scoresheet.deviceId, { ttl: Ttl.Short })
      if (!device) throw new NotFoundError(`Missing device for scoresheet ${scoresheet.id}`)
      return device
    },

    async entry (scoresheet, args, { dataSources, allowUser, user }) {
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: Ttl.Short })
      if (!entry) throw new NotFoundError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      if (!group) throw new NotFoundError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      return entry
    },
    async judge (scoresheet, args, { dataSources, allowUser, user }) {
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: Ttl.Short })
      if (!entry) throw new NotFoundError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      if (!group) throw new NotFoundError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      return (await dataSources.judges.findOneById(scoresheet.judgeId, { ttl: Ttl.Short }))!
    },
  },
  TallyScoresheet: {
    deletedAt (scoresheet) {
      return scoresheet.excludedAt ?? null
    },
    async entry (scoresheet, args, { dataSources, allowUser, user }) {
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: Ttl.Short })
      if (!entry) throw new NotFoundError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      if (!group) throw new NotFoundError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      return entry
    },
    async judge (scoresheet, args, { dataSources, allowUser, user }) {
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: Ttl.Short })
      if (!entry) throw new NotFoundError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      if (!group) throw new NotFoundError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      return (await dataSources.judges.findOneById(scoresheet.judgeId, { ttl: Ttl.Short }))!
    },
  },
}
