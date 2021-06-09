import { hashPassword } from '../services/authentication'
import { ApolloError } from 'apollo-server-errors'
import { Timestamp } from '@google-cloud/firestore'
import { isDevice } from '../store/schema'

import type { Resolvers } from '../generated/graphql'
import type { GroupDoc } from '../store/schema'

export const deviceResolvers: Resolvers = {
  Mutation: {
    async createGroupDevice (_, { groupId, secret }, { dataSources, allowUser }) {
      let group = await dataSources.groups.findOneById(groupId, { ttl: 60 })
      allowUser.group(group).addDevices.assert()
      group = group as GroupDoc

      return (await dataSources.devices.createOne({
        secret: await hashPassword(secret),
        groupId: group.id
      }, { ttl: 60 })) ?? null
    }
  },
  Device: {
    async group (device, args, { dataSources, allowUser }) {
      const group = await dataSources.groups.findOneById(device.groupId, { ttl: 60 })
      if (!group) throw new ApolloError(`Missing group for device ${device.id}`)
      return group
    },
    async scoresheets (device, { since }, { logger, allowUser, user, dataSources }, info) {
      allowUser.getScoresheets.assert()
      const now = Timestamp.fromDate(new Date())
      const scoresheets = await dataSources.scoresheets.findManyByDeviceId(device.id, { since, ttl: 60 })
      if (isDevice(user)) {
        logger.debug({ readTime: now }, 'Updating device scoresheet read time')
        await dataSources.devices.updateOnePartial(user.id, { scoresheetsLastFetchedAt: now })
      }
      return scoresheets
    }
  }
}
