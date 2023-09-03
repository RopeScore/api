import { Ttl } from '../config'
import type { Resolvers } from '../generated/graphql'
import type { CategoryDoc, CompetitionEventLookupCode, EntryDoc, GroupDoc } from '../store/schema'
import { NotFoundError, ValidationError } from '../errors'
import { importPreconfiguredCompetitionEvent, importRuleset } from '@ropescore/rulesets'

async function validateCompetitionEvents (competitionEventIds: string[]) {
  for (const cEvt of competitionEventIds) {
    try {
      await importPreconfiguredCompetitionEvent(cEvt)
    } catch (err) {
      throw new ValidationError('Unsupported competition event', {
        originalError: err as Error,
        extensions: { competitionEventId: cEvt }
      })
    }
  }
}

export const categoryResolvers: Resolvers = {
  Mutation: {
    async createCategory (_, { groupId, data }, { dataSources, allowUser, user, logger }) {
      const group = await dataSources.groups.findOneById(groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId })
      allowUser.group(group, judge).category(undefined).create.assert()

      try {
        await importRuleset(data.rulesId)
      } catch (err) {
        throw new ValidationError('Unsupported ruleset', {
          originalError: err as Error,
          extensions: { rulesId: data.rulesId }
        })
      }
      await validateCompetitionEvents(data.competitionEventIds ?? [])

      const category = await dataSources.categories.createOne({
        groupId,
        name: data.name, // TODO: prevent XSS
        type: data.type,
        rulesId: data.rulesId,
        competitionEventIds: data.competitionEventIds ?? []
      }, { ttl: Ttl.Short })

      return category as CategoryDoc
    },
    async updateCategory (_, { categoryId, data }, { dataSources, allowUser, user }) {
      const category = await dataSources.categories.findOneById(categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      allowUser.group(group, judge).category(category).update.assert()

      const updates: Partial<CategoryDoc> = {}

      if (data.name != null) updates.name = data.name
      if (Array.isArray(data.competitionEventIds)) {
        await validateCompetitionEvents(data.competitionEventIds)
        updates.competitionEventIds = data.competitionEventIds
        await dataSources.entries.deleteManyByCategoryNotEvent({ categoryId, competitionEventIds: data.competitionEventIds })
        await dataSources.judgeAssignments.deleteManyByCategoryNotEvent({ categoryId, competitionEventIds: data.competitionEventIds })
      }

      return await dataSources.categories.updateOnePartial(category.id, updates) as CategoryDoc
    },
    async deleteCategory (_, { categoryId }, { dataSources, allowUser, user, logger }) {
      const category = await dataSources.categories.findOneById(categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      allowUser.group(group, judge).category(category).update.assert()

      // TODO: clean up? soft delete? Maybe not needed since all lookups further down look for the category, which we will no longer find
      logger.warn({ category }, 'deleting category')
      await dataSources.categories.deleteOne(category.id)

      return category
    },

    async setPagePrintConfig (_, { categoryId, competitionEventId, data }, { dataSources, allowUser, user }) {
      const category = await dataSources.categories.findOneById(categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      allowUser.group(group, judge).category(category).update.assert()

      category.pagePrintConfig ??= {}
      category.pagePrintConfig[competitionEventId] ??= {}

      if (typeof data.exclude === 'boolean') category.pagePrintConfig[competitionEventId].exclude = data.exclude
      if (typeof data.zoom === 'number') category.pagePrintConfig[competitionEventId].zoom = data.zoom

      return await dataSources.categories.updateOnePartial(category.id, {
        pagePrintConfig: category.pagePrintConfig
      }) as CategoryDoc
    }
  },
  Category: {
    pagePrintConfig (category) {
      if (!category.pagePrintConfig) return []

      return Object.entries(category.pagePrintConfig).map(([k, v]) => ({
        competitionEventId: k as CompetitionEventLookupCode,
        ...v
      }))
    },

    async group (category, args, { allowUser, dataSources, user }) {
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      allowUser.group(group, judge).get.assert()

      return group as GroupDoc
    },

    async entries (category, { competitionEventId }, { allowUser, dataSources, user }) {
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      allowUser.group(group, judge).listEntries.assert()

      return await dataSources.entries.findManyByCategory({ categoryId: category.id, competitionEventId })
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
      allowUser.group(group, judge).category(category).listParticipants.assert()

      return await dataSources.participants.findManyByCategory({ categoryId: category.id }, { ttl: Ttl.Short })
    },

    async judgeAssignments (category, args, { dataSources, allowUser, user }) {
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId }, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).listJudgeAssignments.assert()

      return dataSources.judgeAssignments.findManyByCategory(category.id, { ttl: Ttl.Short })
    }
  }
}
