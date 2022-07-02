import { FieldValue } from '@google-cloud/firestore'
import { ApolloError } from 'apollo-server-core'
import { Ttl } from '../config'
import { Resolvers } from '../generated/graphql'
import { GroupDoc, JudgeDoc } from '../store/schema'

export const judgeResolvers: Resolvers = {
  Mutation: {
    async createJudge (_, { groupId, data }, { dataSources, allowUser, user }) {
      let group = await dataSources.groups.findOneById(groupId)
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, authJudge).update.assert()
      group = group as GroupDoc

      const judge = await dataSources.judges.createOne({
        groupId: group.id,
        name: data.name,
        ...(data.ijruId ? { ijruId: data.ijruId } : {})
      }, { ttl: Ttl.Short })

      return judge as JudgeDoc
    },
    async updateJudge (_, { judgeId, data }, { dataSources, allowUser, user }) {
      const judge = await dataSources.judges.findOneById(judgeId)
      if (!judge) throw new ApolloError('Judge does not exist')
      const group = await dataSources.groups.findOneById(judge.groupId)
      if (!group) throw new ApolloError('Group does not exist')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, authJudge).update.assert()

      const updates: Partial<JudgeDoc> = {}

      if (data.name) updates.name = data.name
      if (data.ijruId) updates.ijruId = data.ijruId

      return await dataSources.judges.updateOnePartial(judge.id, updates) as JudgeDoc
    },
    async setJudgeDevice (_, { judgeId, deviceId }, { dataSources, allowUser, user }) {
      const judge = await dataSources.judges.findOneById(judgeId)
      if (!judge) throw new ApolloError('Judge does not exist')
      const group = await dataSources.groups.findOneById(judge.groupId)
      if (!group) throw new ApolloError('Group does not exist')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, authJudge).update.assert()

      const device = await dataSources.devices.findOneById(deviceId)
      if (!device) throw new ApolloError('Device does not exist')

      const existing = await dataSources.judges.findOneByDevice({ deviceId: device.id, groupId: group.id })
      if (existing && existing.id !== judge.id) throw new ApolloError('This device is already assigned to another judge', undefined, { judge: existing })

      return await dataSources.judges.updateOnePartial(judge.id, {
        deviceId: device.id
      }) as JudgeDoc
    },
    async unsetJudgeDevice (_, { judgeId }, { dataSources, allowUser, user }) {
      const judge = await dataSources.judges.findOneById(judgeId)
      if (!judge) throw new ApolloError('Judge does not exist')
      const group = await dataSources.groups.findOneById(judge.groupId)
      if (!group) throw new ApolloError('Group does not exist')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, authJudge).update.assert()

      return await dataSources.judges.updateOnePartial(judge.id, {
        deviceId: FieldValue.delete()
      }) as JudgeDoc
    }
  },
  Judge: {
    async group (judge, args, { allowUser, dataSources, user }) {
      const group = await dataSources.groups.findOneById(judge.groupId, { ttl: Ttl.Short })
      if (!group) throw new ApolloError('Group does not exist')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, authJudge).get.assert()
      return group
    },

    async device (judge, args, { allowUser, dataSources }) {
      // TODO: check permissions
      if (!judge.deviceId) return null

      return await dataSources.devices.findOneById(judge.deviceId) ?? null
    },

    async assignments (judge, { categoryId }, { allowUser, dataSources, user }) {
      const group = await dataSources.groups.findOneById(judge.groupId, { ttl: Ttl.Short })
      if (!group) throw new ApolloError('Group does not exist')
      const authJudge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, authJudge).getUsers.assert()
      const categoryIds = []
      if (categoryId) {
        categoryIds.push(categoryId)
      } else {
        const categories = await dataSources.categories.findManyByGroup(group, { ttl: Ttl.Short })
        categoryIds.push(...categories.map(c => c.id))
      }

      return await dataSources.judgeAssignments.findManyByJudge({ judgeId: judge.id, categoryIds })
    }
  }
}
