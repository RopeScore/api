import { ApolloError } from 'apollo-server-core'
import { Ttl } from '../config'
import { Resolvers } from '../generated/graphql'
import { JudgeAssignmentDoc } from '../store/schema'

export const judgeAssignmentResolvers: Resolvers = {
  Mutation: {
    async createJudgeAssignment (_, { judgeId, categoryId, data }, { dataSources, allowUser }) {
      const judge = await dataSources.judges.findOneById(judgeId, { ttl: Ttl.Short })
      if (!judge) throw new ApolloError('Judge does not exist')
      const category = await dataSources.categories.findOneById(categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category does not exist')

      const group = await dataSources.groups.findOneById(judge.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).judge(judge).assign.assert()

      await dataSources.judgeAssignments.createOne({
        judgeId: judge.id,
        categoryId: category.id,

        competitionEventId: data.competitionEventId,
        judgeType: data.judgeType,

        options: data.options
      })

      return judge
    },
    async updateJudgeAssignment (_, { judgeAssignmentId, data }, { dataSources, allowUser }) {
      const assignment = await dataSources.judgeAssignments.findOneById(judgeAssignmentId)
      if (!assignment) throw new ApolloError('Assignment does not exist')
      const judge = await dataSources.judges.findOneById(assignment.judgeId, { ttl: Ttl.Short })
      if (!judge) throw new ApolloError('Judge does not exist')
      const category = await dataSources.categories.findOneById(assignment.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category does not exist')

      const group = await dataSources.groups.findOneById(judge.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).judge(judge).assign.assert()

      return await dataSources.judgeAssignments.updateOnePartial(assignment.id, {
        options: data.options
      }) as JudgeAssignmentDoc
    },
    async deleteJudgeAssignment (_, { judgeAssignmentId }, { dataSources, allowUser }) {
      const assignment = await dataSources.judgeAssignments.findOneById(judgeAssignmentId)
      if (!assignment) throw new ApolloError('Assignment does not exist')
      const judge = await dataSources.judges.findOneById(assignment.judgeId, { ttl: Ttl.Short })
      if (!judge) throw new ApolloError('Judge does not exist')
      const category = await dataSources.categories.findOneById(assignment.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category does not exist')

      const group = await dataSources.groups.findOneById(judge.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).judge(judge).assign.assert()

      await dataSources.judgeAssignments.deleteOne(assignment.id)

      return assignment
    }
  },
  JudgeAssignment: {
    async judge (judgeAssignment, args, { dataSources, allowUser }) {
      const judge = await dataSources.judges.findOneById(judgeAssignment.judgeId, { ttl: Ttl.Short })
      if (!judge) throw new ApolloError('Judge does not exist')
      const group = await dataSources.groups.findOneById(judge.groupId, { ttl: Ttl.Short })
      allowUser.group(group).getUsers.assert()

      return judge
    },
    async category (judgeAssignment, args, { dataSources, allowUser }) {
      const category = await dataSources.categories.findOneById(judgeAssignment.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).get.assert()

      return category
    }
  }
}
