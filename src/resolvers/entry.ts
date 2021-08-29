import { Timestamp } from '@google-cloud/firestore'
import { ApolloError } from 'apollo-server-core'
import type { Resolvers } from '../generated/graphql'
import { EntryDoc, GroupDoc, isDevice } from '../store/schema'

export const entryResolvers: Resolvers = {
  Mutation: {
    async createEntry (_, { groupId, entry }, { dataSources, allowUser }) {
      const group = await dataSources.groups.findOneById(groupId, { ttl: 60 })
      allowUser.group(group).addEntries.assert()
      const createdEntry = await dataSources.entries.createOne({
        groupId,
        ...entry
      }) as EntryDoc
      return createdEntry
    },
    async setEntryDidNotSkip (_, { entryId }, { allowUser, dataSources }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new ApolloError('Scoresheet not found')
      const group = await dataSources.groups.findOneById(entry.groupId, { ttl: 60 })
      allowUser.group(group).entry(entry).edit.assert()

      const now = Timestamp.now()
      return dataSources.entries.updateOnePartial(entryId, {
        didNotSkipAt: now
      }) as Promise<EntryDoc>
    },
    async reorderEntry (_, { entryId, heat }, { allowUser, dataSources }) {
      const entry = await dataSources.entries.findOneById(entryId)
      if (!entry) throw new ApolloError('Scoresheet not found')
      const group = await dataSources.groups.findOneById(entry.groupId, { ttl: 60 })
      allowUser.group(group).entry(entry).edit.assert()

      return await dataSources.entries.updateOnePartial(entryId, { heat }) as EntryDoc
    }
  },
  Entry: {
    async group (entry, args, { dataSources, allowUser, user, logger }) {
      const group = await dataSources.groups.findOneById(entry.groupId, { ttl: 60 })
      if (!group) throw new ApolloError('group not found')
      allowUser.group(group).get.assert()
      return group
    },
    async scoresheets (entry, args, { dataSources, allowUser, user, logger }) {
      let group = await dataSources.groups.findOneById(entry.groupId, { ttl: 60 })
      allowUser.group(group).entry(entry).get.assert()
      group = group as GroupDoc
      const now = Timestamp.now()
      logger.debug({ isDevice: isDevice(user) }, 'is device')

      const scoresheets = await dataSources.scoresheets.findManyByGroupDevice({
        deviceId: isDevice(user) ? user.id : undefined,
        entryId: entry.id
      })

      if (isDevice(user)) {
        logger.debug({ readTime: now }, 'Updating device scoresheet read time')
        await dataSources.groups.updateOnePartial(group.id, { scoresheetsLastFetchedAt: { [user.id]: now } })
      }

      return scoresheets
    },
    async scoresheet (entry, { scoresheetId }, { dataSources, allowUser }) {
      const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
      const group = await dataSources.groups.findOneById(entry.groupId, { ttl: 60 })
      allowUser.group(group).entry(entry).scoresheet(scoresheet).get.assert()

      return scoresheet ?? null
    }
  }
}
