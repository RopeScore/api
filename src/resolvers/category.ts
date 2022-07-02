import { Timestamp } from '@google-cloud/firestore'
import { ApolloError } from 'apollo-server-core'
import { Ttl } from '../config'
import { Resolvers } from '../generated/graphql'
import { CategoryDoc, EntryDoc, GroupDoc } from '../store/schema'

export const categoryResolvers: Resolvers = {
  Mutation: {
    async createCategory (_, { groupId, data }, { dataSources, allowUser, user, logger }) {
      const group = await dataSources.groups.findOneById(groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).category(undefined).create.assert()

      const now = Timestamp.now()

      const category = await dataSources.categories.createOne({
        groupId,
        name: data.name, // TODO: prevent XSS
        createdAt: now,
        updatedAt: now,
        type: data.type,
        rulesId: data.rulesId,
        competitionEventIds: data.competitionEventIds ?? []
      }, { ttl: Ttl.Short })

      return category as CategoryDoc
    },
    async updateCategory (_, { categoryId, data }, { dataSources, allowUser, user }) {
      const category = await dataSources.categories.findOneById(categoryId)
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      allowUser.group(group, judge).category(category).update.assert()

      const updates: Partial<CategoryDoc> = {}

      if (data.name != null) updates.name = data.name
      if (Array.isArray(data.competitionEventIds)) updates.competitionEventIds = data.competitionEventIds
      // TODO: remove left over entries

      return await dataSources.categories.updateOnePartial(category.id, updates) as CategoryDoc
    },
    async deleteCategory (_, { categoryId }, { dataSources, allowUser, user, logger }) {
      const category = await dataSources.categories.findOneById(categoryId)
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      allowUser.group(group, judge).category(category).update.assert()

      // TODO: clean up? soft delete?
      logger.warn({ category }, 'deleting category')
      await dataSources.categories.deleteOne(category.id)

      return category
    }
  },
  Category: {
    async group (category, args, { allowUser, dataSources, user }) {
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      allowUser.group(group, judge).get.assert()

      return group as GroupDoc
    },

    async entries (category, args, { allowUser, dataSources, user }) {
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      allowUser.group(group, judge).get.assert()

      return await dataSources.entries.findManyByCategory(category.id)
    },
    async entry (category, { entryId }, { dataSources, allowUser, user }) {
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      const entry = await dataSources.entries.findOneById(entryId)
      allowUser.group(group, judge).category(category).entry(entry).get.assert()

      return entry as EntryDoc
    },

    async participants (category, args, { dataSources, allowUser, user }) {
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).get.assert()

      return await dataSources.participants.findManyByCategory({ categoryId: category.id }, { ttl: Ttl.Short })
    },

    async judgeAssignments (category, args, { dataSources, allowUser, user }) {
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).get.assert()

      return dataSources.judgeAssignments.findManyByCategory(category.id, { ttl: Ttl.Short })
    }
  }
}
