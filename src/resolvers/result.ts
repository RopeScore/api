import pLimit from 'p-limit'
import { NotFoundError, ValidationError } from '../errors'
import { ResultVersionType, type Resolvers } from '../generated/graphql'
import { ResultVisibilityLevel, type CompetitionEventLookupCode, type RankedResultDoc } from '../store/schema'
import { Ttl } from '../config'
import { calculateResult, getMaxEntryLockedAt } from '../services/results'
import { type Timestamp } from '@google-cloud/firestore'

function getVisibilities (authenticated: boolean, visibilityLevel: ResultVisibilityLevel | undefined, maxVisibility?: ResultVersionType | null) {
  let base: ResultVersionType[] = []
  if (authenticated || visibilityLevel === ResultVisibilityLevel.Live) {
    base = [ResultVersionType.Public, ResultVersionType.Private, ResultVersionType.Temporary]
  } else if (!authenticated && visibilityLevel === ResultVisibilityLevel.PublicVersions) {
    base = [ResultVersionType.Public]
  }
  if (maxVisibility == null) return base
  const maxId = base.indexOf(maxVisibility)
  if (maxId === -1) return base
  else return base.slice(0, maxId + 1)
}
const GET_ENTRY_LOCK_LIMIT = 20
const CALCULATE_RESULTS_LIMIT = 10

export const resultResolvers: Resolvers = {
  Category: {
    async rankedResults (category, { maxVisibility, competitionEventId, limit, beforeLockedAt }, { dataSources, allowUser, user }) {
      const group = await dataSources.groups.findOneById(category.groupId)
      if (group == null) throw new NotFoundError('Group not found')
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      const scopedAllow = allowUser.group(group, judge).category(category)
      scopedAllow.listResults.assert()

      const visibilities = getVisibilities(user != null, group.resultVisibility, maxVisibility)
      if (visibilities.length === 0) return []
      const results = await dataSources.rankedResults.findManyByCategory({
        categoryId: category.id,
        competitionEventId,
        versionTypes: visibilities,
        limit,
        startAfter: beforeLockedAt
      })
      if (competitionEventId != null && !category.competitionEventIds.includes(competitionEventId)) {
        throw new ValidationError(`Requested competition event ${competitionEventId} is not enabled on category`)
      }

      if (visibilities.includes(ResultVersionType.Temporary) && beforeLockedAt == null) {
        const competitionEventIds = competitionEventId != null ? [competitionEventId] : category.competitionEventIds
        const fetchLimit = pLimit(GET_ENTRY_LOCK_LIMIT)
        const calcLimit = pLimit(CALCULATE_RESULTS_LIMIT)

        const maxEntryLockedAt: Record<CompetitionEventLookupCode, Timestamp | null> = Object.fromEntries(await Promise.all(competitionEventIds.map(async competitionEventId =>
          await fetchLimit(async () =>
            [competitionEventId, await getMaxEntryLockedAt(category.id, competitionEventId, { dataSources })]
          )
        )))

        const toCalculate = competitionEventIds.filter(competitionEventId => {
          const result = results.find(r => r.competitionEventId === competitionEventId)
          const maxLockedAt = maxEntryLockedAt[competitionEventId]
          if (result == null || (maxLockedAt != null && maxLockedAt > result.maxEntryLockedAt)) return true
          else return false
        })
        await Promise.all(toCalculate.map(async (competitionEventId) =>
          await calcLimit(async () => {
            const res = await calculateResult(category.id, competitionEventId, { dataSources })
            if (res.maxEntryLockedAt == null) return null
            const saved = await dataSources.rankedResults.createOne({
              categoryId: category.id,
              competitionEventId,

              maxEntryLockedAt: res.maxEntryLockedAt,

              versionType: ResultVersionType.Temporary,
              versionName: null,

              results: res.results
            })
            results.push(saved as RankedResultDoc)
          })
        ))
      }

      return results.filter(r => scopedAllow.rankedResult(r).get())
    },
    async rankedResult (category, { resultId }, { dataSources, user, allowUser }) {
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      const result = await dataSources.rankedResults.findOneById(resultId, { ttl: Ttl.Long })
      allowUser.group(group, judge).category(category).rankedResult(result).get.assert()

      return result ?? null
    },
    async latestRankedResult (category, { competitionEventId, maxVisibility }, { dataSources, allowUser, user }) {
      const group = await dataSources.groups.findOneById(category.groupId)
      if (group == null) throw new NotFoundError('Group not found')
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })

      const visibilities = getVisibilities(user != null, group.resultVisibility, maxVisibility)
      if (visibilities.length === 0) return null
      const result = await dataSources.rankedResults.findLatestByCompetitionEvent({
        categoryId: category.id,
        competitionEventId,
        versionTypes: visibilities
      })
      allowUser.group(group, judge).category(category).rankedResult(result).get.assert()
      if (competitionEventId != null && !category.competitionEventIds.includes(competitionEventId)) {
        throw new ValidationError(`Requested competition event ${competitionEventId} is not enabled on category`)
      }

      if (visibilities.includes(ResultVersionType.Temporary)) {
        // TODO: overalls!
        const maxEntryLockedAt = await getMaxEntryLockedAt(category.id, competitionEventId, { dataSources })
        if (result == null || (maxEntryLockedAt != null && maxEntryLockedAt > result.maxEntryLockedAt)) {
          const res = await calculateResult(category.id, competitionEventId, { dataSources })
          if (res.maxEntryLockedAt != null) {
            const saved = await dataSources.rankedResults.createOne({
              categoryId: category.id,
              competitionEventId,

              maxEntryLockedAt: res.maxEntryLockedAt,

              versionType: ResultVersionType.Temporary,
              versionName: null,

              results: res.results
            })
            return saved as RankedResultDoc
          }
        }
      }

      return result ?? null
    }
  },
  Mutation: {
    async setRankedResultVersion (_, { resultId, type, name }, { dataSources, allowUser, user }) {
      if (type === ResultVersionType.Temporary) throw new ValidationError('Use removeRankedResultVersion instead of trying to set it to a temporary version')
      const result = await dataSources.rankedResults.findOneById(resultId)
      if (!result) throw new NotFoundError('Ranked result not found')
      const category = await dataSources.categories.findOneById(result.categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      allowUser.group(group, judge).category(category).rankedResult(result).update.assert()

      const updated = await dataSources.rankedResults.updateOnePartial(resultId, {
        versionType: type,
        versionName: name
      })

      return updated as RankedResultDoc
    },
    async removeRankedResultVersion (_, { resultId }, { dataSources, allowUser, user }) {
      const result = await dataSources.rankedResults.findOneById(resultId)
      if (!result) throw new NotFoundError('Ranked result not found')
      const category = await dataSources.categories.findOneById(result.categoryId)
      if (!category) throw new NotFoundError('Category not found')
      const group = await dataSources.groups.findOneById(category.groupId)
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: category.groupId })
      allowUser.group(group, judge).category(category).rankedResult(result).update.assert()

      const updated = await dataSources.rankedResults.updateOnePartial(resultId, {
        versionType: ResultVersionType.Temporary,
        versionName: null
      })

      return updated as RankedResultDoc
    }
  }
}
