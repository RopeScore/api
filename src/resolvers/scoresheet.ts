import { Timestamp } from '@google-cloud/firestore'
import { ApolloError } from 'apollo-server-errors'

import type { Resolvers } from '../generated/graphql'
import { isScoresheet, ScoresheetDoc } from '../store/schema'

export const scoresheetResolvers: Resolvers = {
  Mutation: {
    async createScoresheets (_, { groupId, scoresheets }, { allowUser, dataSources }) {
      const group = await dataSources.groups.findOneById(groupId, { ttl: 60 })
      allowUser.group(group).addScoresheets.assert()
      const now = Timestamp.now()
      const createdProm = await Promise.allSettled(scoresheets.map(input =>
        dataSources.scoresheets.createOne({
          groupId,
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
    async fillScoresheet (_, { scoresheetId, openedAt, completedAt, marks }, { allowUser, dataSources }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      if (!scoresheet) throw new ApolloError('Scoresheet not found')
      const group = await dataSources.groups.findOneById(scoresheet.groupId, { ttl: 60 })
      allowUser.group(group).scoresheet(scoresheet).fill.assert()
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
    async setScoresheetDidNotSkip (_, { scoresheetId }, { allowUser, dataSources }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      if (!scoresheet) throw new ApolloError('Scoresheet not found')
      const group = await dataSources.groups.findOneById(scoresheet.groupId, { ttl: 60 })
      allowUser.group(group).scoresheet(scoresheet).edit.assert()

      const now = Timestamp.now()
      return dataSources.scoresheets.updateOnePartial(scoresheetId, {
        didNotSkipAt: now,
        submittedAt: now,
        updatedAt: now
      }) as Promise<ScoresheetDoc>
    },
    async reorderScoresheet (_, { scoresheetId, heat }, { allowUser, dataSources }) {
      let scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      if (!scoresheet) throw new ApolloError('Scoresheet not found')
      const group = await dataSources.groups.findOneById(scoresheet.groupId, { ttl: 60 })
      allowUser.group(group).scoresheet(scoresheet).edit.assert()

      scoresheet = await dataSources.scoresheets.updateOnePartial(scoresheetId, { heat }) as ScoresheetDoc

      return scoresheet
    }
  },
  Scoresheet: {
    async device (scoresheet, args, { dataSources, allowUser }) {
      const group = await dataSources.groups.findOneById(scoresheet.groupId, { ttl: 60 })
      allowUser.group(group).scoresheet(scoresheet).get.assert()
      const device = await dataSources.devices.findOneById(scoresheet.deviceId, { ttl: 60 })
      if (!device) throw new ApolloError(`Missing device for scoresheet ${scoresheet.id}`)
      return device
    },
    async group (scoresheet, args, { dataSources, allowUser }) {
      const group = await dataSources.groups.findOneById(scoresheet.groupId, { ttl: 60 })
      allowUser.group(group).scoresheet(scoresheet).get.assert()
      if (!group) throw new ApolloError(`Missing group for scoresheet ${scoresheet.id}`)
      return group
    }
  }
}
