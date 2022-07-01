import { Timestamp } from '@google-cloud/firestore'
import { ApolloError } from 'apollo-server-errors'
import { withFilter } from 'graphql-subscriptions'
import { ID } from 'graphql-ws'
import { ApolloContext } from '../apollo'
import { Ttl } from '../config'

import type { Resolvers } from '../generated/graphql'
import { pubSub, RsEvents } from '../services/pubsub'
import { isMarkScoresheet, isTallyScoresheet, JudgeDoc, MarkScoresheetDoc, TallyScoresheetDoc } from '../store/schema'

export const scoresheetResolvers: Resolvers = {
  Mutation: {
    async createMarkScoresheet (_, { entryId, judgeId, data }, { allowUser, dataSources, user }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new ApolloError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(undefined).create.assert()

      const judge = await dataSources.judges.findOneById(judgeId)
      if (!judge || judge.groupId !== group.id) throw new ApolloError('Judge not found')
      const assignment = await dataSources.judgeAssignments.findOneByJudge({
        judgeId: judge.id,
        categoryId: category.id
      })
      if (!assignment) throw new ApolloError('The selected judge does not have an assignment in this category')

      const now = Timestamp.now()
      return await dataSources.scoresheets.createOne({
        entryId,
        judgeId,

        rulesId: category.rulesId,
        judgeType: assignment.judgeType,
        competitionEventId: entry.competitionEventLookupCode,
        deviceId: judge.deviceId,

        createdAt: now,
        updatedAt: now,

        marks: [],
        options: {
          ...assignment.options,
          ...data.options
        }
      }) as MarkScoresheetDoc
    },
    async createTallyScoresheet (_, { entryId, judgeId, data }, { allowUser, dataSources, user, logger }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new ApolloError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(undefined).create.assert()

      const judge = await dataSources.judges.findOneById(judgeId)
      if (!judge || judge.groupId !== group.id) throw new ApolloError('Judge not found')
      const assignment = await dataSources.judgeAssignments.findOneByJudge({
        judgeId: judge.id,
        categoryId: category.id
      })
      if (!assignment) throw new ApolloError('The selected judge does not have an assignment in this category')

      let tally = {}
      if (data.tally) {
        if (!Object.entries(data.tally).every(([k, v]) => typeof k === 'string' && typeof v === 'number')) {
          logger.warn({ tally: data.tally }, 'Invalid incoming tally')
        }
        tally = data.tally
      }

      const now = Timestamp.now()
      return await dataSources.scoresheets.createOne({
        entryId,
        judgeId,

        rulesId: category.rulesId,
        judgeType: assignment.judgeType,
        competitionEventId: entry.competitionEventLookupCode,

        createdAt: now,
        updatedAt: now,

        tally,
        options: {
          ...assignment.options,
          ...data.options
        }
      }) as TallyScoresheetDoc
    },
    // async setScoresheetOptions (_, { scoresheetId, options }, { allowUser, dataSources }) {
    //   const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
    //   if (!scoresheet) throw new ApolloError('Scoresheet not found')
    //   const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: Ttl.Short })
    //   if (!entry) throw new ApolloError('Entry not found')
    //   const group = await dataSources.groups.findOneById(entry.groupId, { ttl: Ttl.Short })
    //   allowUser.group(group).entry(entry).scoresheet(scoresheet).edit.assert()

    //   scoresheet.options = options
    //   scoresheet.updatedAt = Timestamp.now()

    //   return dataSources.scoresheets.updateOne(scoresheet) as Promise<ScoresheetDoc>
    // },
    async fillTallyScoresheet (_, { scoresheetId, tally }, { allowUser, dataSources, user }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      if (!scoresheet) throw new ApolloError('Scoresheet not found')
      const entry = await dataSources.entries.findOneById(scoresheet.entryId)
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new ApolloError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).fillTally.assert()
      if (!isTallyScoresheet(scoresheet)) throw new ApolloError('Scoresheet updates are not for a mark scoresheet')

      const now = Timestamp.now()
      const updates: Partial<TallyScoresheetDoc> = {
        updatedAt: now
      }

      const invalidKeys = Object.entries(tally).filter(([k, v]) => typeof k !== 'string' || typeof v !== 'number')
      if (invalidKeys.length > 0) {
        throw new ApolloError(`Tally is not valid, invalid keys: ${invalidKeys.join(', ')}`, undefined, { invalidKeys })
      }
      updates.tally = tally

      return await dataSources.scoresheets.updateOnePartial(scoresheetId, updates) as TallyScoresheetDoc
    },
    async fillMarkScoresheet (_, { scoresheetId, openedAt, completedAt, marks }, { allowUser, dataSources, user }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      if (!scoresheet) throw new ApolloError('Scoresheet not found')
      const entry = await dataSources.entries.findOneById(scoresheet.entryId)
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId)
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new ApolloError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).fillMark.assert()

      const now = Timestamp.now()
      const updates: Partial<MarkScoresheetDoc> = {
        updatedAt: now
      }

      if (!openedAt && !marks && !completedAt) throw new ApolloError('Nothing to update')
      if (!isMarkScoresheet(scoresheet)) throw new ApolloError('Scoresheet updates are not for a mark scoresheet')

      if (openedAt) {
        if (!scoresheet.openedAt) scoresheet.openedAt = []
        scoresheet.openedAt.push(openedAt)
        updates.openedAt = scoresheet.openedAt
      }
      if (marks) {
        if (!scoresheet.openedAt?.length) throw new ApolloError('Cannot add marks before the scoresheet has been opened')
        // more input validation
        for (let idx = 0; idx < marks.length; idx++) {
          const mark = marks[idx]
          if (!mark) throw new ApolloError(`Invalid mark at index ${idx}`)
          if (typeof mark.sequence !== 'number' || mark.sequence !== idx) throw new ApolloError(`Mark sequence is broken at index ${idx}`)
          if (typeof mark.timestamp !== 'number' || (idx > 0 && marks[idx - 1]?.timestamp > mark.timestamp)) throw new ApolloError(`Mark at index ${idx} happens before mark ${idx - 1}`)
          if (typeof mark.schema !== 'string') throw new ApolloError(`no mark schema specified at index ${idx}`)
        }
        updates.marks = marks as MarkScoresheetDoc['marks']
      }
      if (completedAt) {
        if (!scoresheet.openedAt?.length) throw new ApolloError('Cannot complete an unopened scoresheet')
        updates.completedAt = completedAt
        updates.submittedAt = now
      }

      return await dataSources.scoresheets.updateOnePartial(scoresheetId, updates) as MarkScoresheetDoc
    },

    async addStreamMark (_, { scoresheetId, mark }, { dataSources, allowUser, user }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId, { ttl: Ttl.Long })
      if (!scoresheet) throw new ApolloError('Scoresheet not found')
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: Ttl.Long })
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Long })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Long })
      if (!group) throw new ApolloError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Long })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).fillMark.assert()

      if (!mark) throw new ApolloError('Invalid mark')
      if (typeof mark.sequence !== 'number') throw new ApolloError('Missing Mark timestamp')
      if (typeof mark.timestamp !== 'number') throw new ApolloError('Missing Mark timestamp')
      if (typeof mark.schema !== 'string') throw new ApolloError('No mark schema specified')

      const markEvent = { ...mark, scoresheetId }

      await pubSub.publish(RsEvents.MARK_ADDED, markEvent)

      return markEvent
    }
  },
  Subscription: {
    streamMarkAdded: {
      // @ts-expect-error
      subscribe: withFilter(
        () => pubSub.asyncIterator([RsEvents.MARK_ADDED]),
        async (payload: { scoresheetId: ID, [prop: string]: any }, variables: { scoresheetIds: ID[] }, { allowUser, dataSources, user, logger }: ApolloContext) => {
          try {
            // if we haven't even asked for it we can just skip it
            if (!variables.scoresheetIds.includes(payload.scoresheetId)) return false

            // If we've asked for it we need read access on the scoresheet
            const scoresheet = await dataSources.scoresheets.findOneById(payload.scoresheetId, { ttl: Ttl.Long })
            if (!scoresheet) return false
            const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: Ttl.Long })
            if (!entry) return false
            const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Long })
            if (!category) throw new ApolloError('Category not found')
            const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Long })
            if (!group) throw new ApolloError('Group not found')
            const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Long })
            const allow = allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).get()

            return allow
          } catch (err) {
            logger.error(err)
            return false
          }
        }
      ),
      resolve: (payload: any) => payload
    }
  },
  MarkScoresheet: {
    async device (scoresheet, args, { dataSources, allowUser, user }) {
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: Ttl.Short })
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      if (!group) throw new ApolloError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      const device = await dataSources.devices.findOneById(scoresheet.deviceId, { ttl: Ttl.Short })
      if (!device) throw new ApolloError(`Missing device for scoresheet ${scoresheet.id}`)
      return device
    },

    async entry (scoresheet, args, { dataSources, allowUser, user }) {
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: Ttl.Short })
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      if (!group) throw new ApolloError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      return entry
    },
    async judge (scoresheet, args, { dataSources, allowUser, user }) {
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: Ttl.Short })
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      if (!group) throw new ApolloError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      return await dataSources.judges.findOneById(scoresheet.judgeId, { ttl: Ttl.Short }) as JudgeDoc
    }
  },
  TallyScoresheet: {
    async entry (scoresheet, args, { dataSources, allowUser, user }) {
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: Ttl.Short })
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      if (!group) throw new ApolloError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      return entry
    },
    async judge (scoresheet, args, { dataSources, allowUser, user }) {
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: Ttl.Short })
      if (!entry) throw new ApolloError('Entry not found')
      const category = await dataSources.categories.findOneById(entry.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      if (!group) throw new ApolloError('Group not found')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).get.assert()

      return await dataSources.judges.findOneById(scoresheet.judgeId, { ttl: Ttl.Short }) as JudgeDoc
    }
  }
}
