import { Timestamp } from '@google-cloud/firestore'
import { ApolloError } from 'apollo-server-core'
import { Ttl } from '../config'
import { Resolvers } from '../generated/graphql'
import { CategoryDoc, EntryDoc, GroupDoc } from '../store/schema'

export const categoryResolvers: Resolvers = {
  Mutation: {
    async createCategory (_, { groupId, data }, { dataSources, allowUser }) {
      const group = await dataSources.groups.findOneById(groupId, { ttl: Ttl.Short })
      allowUser.group(group).category().create.assert()

      const now = Timestamp.now()

      await dataSources.categories.createOne({
        groupId,
        name: data.name, // TODO: prevent XSS
        createdAt: now,
        updatedAt: now,
        type: data.type,
        rulesId: data.rulesId,
        competitionEventIds: data.competitionEventIds ?? []
      }, { ttl: Ttl.Short })

      return group as GroupDoc
    },
    async updateCategory (_, { categoryId, data }, { dataSources, allowUser }) {
      const category = await dataSources.categories.findOneById(categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).update.assert()

      const updates: Partial<CategoryDoc> = {}

      if (data.name != null) updates.name = data.name
      if (Array.isArray(data.competitionEventIds)) updates.competitionEventIds = data.competitionEventIds
      // TODO: remove left over entries

      return await dataSources.categories.updateOnePartial(category.id, updates) as CategoryDoc
    },
    async deleteCategory (_, { categoryId }, { dataSources, allowUser, logger }) {
      const category = await dataSources.categories.findOneById(categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).update.assert()

      // TODO: clean up? soft delete?
      logger.warn({ category }, 'deleting category')
      await dataSources.categories.deleteOne(category.id)

      return category
    }
  },
  Category: {
    async group (category, args, { allowUser, dataSources }) {
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).get.assert()

      return group as GroupDoc
    },

    async entries (category, args, { allowUser, dataSources }) {
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).get.assert()

      return await dataSources.entries.findManyByQuery(c => c.where('categoryId', '==', category.id))
    },
    async entry (category, { entryId }, { dataSources, allowUser }) {
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const entry = await dataSources.entries.findOneById(entryId)
      allowUser.group(group).category(category).entry(entry).get.assert()

      return entry as EntryDoc
    }
  }
}
