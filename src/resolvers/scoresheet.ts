import { Timestamp } from '@google-cloud/firestore'
import { ApolloError } from 'apollo-server-errors'
import { withFilter } from 'graphql-subscriptions'
import { ID } from 'graphql-ws'
import { ApolloContext } from '../apollo'

import type { Resolvers } from '../generated/graphql'
import { pubSub, RsEvents } from '../services/pubsub'
import { isScoresheet, ScoresheetDoc } from '../store/schema'

export const scoresheetResolvers: Resolvers = {
  Mutation: {
    async createScoresheets (_, { entryId, scoresheets }, { allowUser, dataSources }) {
      const entry = await dataSources.entries.findOneById(entryId, { ttl: 60 })
      if (!entry) throw new ApolloError('Entry not found')
      const group = await dataSources.groups.findOneById(entry.groupId, { ttl: 60 })
      allowUser.group(group).entry(entry).addScoresheets.assert()
      const now = Timestamp.now()
      const createdProm = await Promise.allSettled(scoresheets.map(input => // eslint-disable-line @typescript-eslint/promise-function-async
        dataSources.scoresheets.createOne({
          entryId,
          ...input,
          marks: [],
          createdAt: now,
          updatedAt: now
        })
      ))
      const created = createdProm
        .filter((p): p is { status: 'fulfilled', value: ScoresheetDoc } => p.status === 'fulfilled' && isScoresheet(p.value))
        .map(p => p.value)
      return created
    },
    async reassignScoresheet (_, { scoresheetId, deviceId }, { allowUser, dataSources }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      if (!scoresheet) throw new ApolloError('Scoresheet not found')
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: 60 })
      if (!entry) throw new ApolloError('Entry not found')
      const group = await dataSources.groups.findOneById(entry.groupId, { ttl: 60 })
      allowUser.group(group).entry(entry).scoresheet(scoresheet).edit.assert()

      const now = Timestamp.now()
      return dataSources.scoresheets.updateOnePartial(scoresheetId, {
        deviceId,
        updatedAt: now
      }) as Promise<ScoresheetDoc>
    },
    async changeScoresheetOptions (_, { scoresheetId, options }, { allowUser, dataSources }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      if (!scoresheet) throw new ApolloError('Scoresheet not found')
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: 60 })
      if (!entry) throw new ApolloError('Entry not found')
      const group = await dataSources.groups.findOneById(entry.groupId, { ttl: 60 })
      allowUser.group(group).entry(entry).scoresheet(scoresheet).edit.assert()

      scoresheet.options = options
      scoresheet.updatedAt = Timestamp.now()

      return dataSources.scoresheets.updateOne(scoresheet) as Promise<ScoresheetDoc>
    },
    async fillScoresheet (_, { scoresheetId, openedAt, completedAt, marks }, { allowUser, dataSources }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      if (!scoresheet) throw new ApolloError('Scoresheet not found')
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: 60 })
      if (!entry) throw new ApolloError('Entry not found')
      const group = await dataSources.groups.findOneById(entry.groupId, { ttl: 60 })
      allowUser.group(group).entry(entry).scoresheet(scoresheet).fill.assert()
      const now = Timestamp.now()
      const updates: Partial<ScoresheetDoc> = {
        updatedAt: now
      }

      if (!openedAt && !marks && !completedAt) throw new ApolloError('Nothing to update')

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
        updates.marks = marks as ScoresheetDoc['marks']
      }
      if (completedAt) {
        if (!scoresheet.openedAt?.length) throw new ApolloError('Cannot complete an unopened scoresheet')
        updates.completedAt = completedAt
        updates.submittedAt = now
      }

      return dataSources.scoresheets.updateOnePartial(scoresheetId, updates) as Promise<ScoresheetDoc>
    },
    async addStreamMark (_, { scoresheetId, mark }, { dataSources, allowUser }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId, { ttl: 300 })
      if (!scoresheet) throw new ApolloError('Scoresheet not found')
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: 300 })
      if (!entry) throw new ApolloError('Entry not found')
      const group = await dataSources.groups.findOneById(entry.groupId, { ttl: 300 })
      allowUser.group(group).entry(entry).scoresheet(scoresheet).fill.assert()

      if (!mark) throw new ApolloError('Invalid mark')
      if (typeof mark.sequence !== 'number') throw new ApolloError('Missing Mark timestamp')
      if (typeof mark.timestamp !== 'number') throw new ApolloError('Missing Mark timestamp')
      if (typeof mark.schema !== 'string') throw new ApolloError('no mark schema specified')

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
        async (payload: { scoresheetId: ID, [prop: string]: any }, variables: { scoresheetIds: ID[] }, { allowUser, dataSources, logger }: ApolloContext) => {
          try {
            // if we haven't even asked for it we can just skip it
            if (!variables.scoresheetIds.includes(payload.scoresheetId)) return false

            // If we've asked for it we need read access on the scoresheet
            const scoresheet = await dataSources.scoresheets.findOneById(payload.scoresheetId, { ttl: 300 })
            if (!scoresheet) return false
            const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: 300 })
            if (!entry) return false
            const group = await dataSources.groups.findOneById(entry.groupId, { ttl: 300 })
            const allow = allowUser.group(group).entry(entry).scoresheet(scoresheet).get()

            if (allow) return true
            else return false
          } catch (err) {
            logger.error(err)
            return false
          }
        }
      ),
      resolve: (payload: any) => payload
    }
  },
  Scoresheet: {
    async device (scoresheet, args, { dataSources, allowUser }) {
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: 60 })
      if (!entry) throw new ApolloError('Entry not found')
      const group = await dataSources.groups.findOneById(entry.groupId, { ttl: 60 })
      allowUser.group(group).entry(entry).scoresheet(scoresheet).get.assert()
      const device = await dataSources.devices.findOneById(scoresheet.deviceId, { ttl: 60 })
      if (!device) throw new ApolloError(`Missing device for scoresheet ${scoresheet.id}`)
      return device
    },
    async entry (scoresheet, args, { dataSources, allowUser }) {
      const entry = await dataSources.entries.findOneById(scoresheet.entryId, { ttl: 60 })
      if (!entry) throw new ApolloError('Entry not found')
      const group = await dataSources.groups.findOneById(entry.groupId, { ttl: 60 })
      allowUser.group(group).entry(entry).scoresheet(scoresheet).get.assert()
      return entry
    }
  }
}
