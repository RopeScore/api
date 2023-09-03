import { type CompetitionEvent, importPreconfiguredCompetitionEvent, importPreconfiguredOverall, type Overall, type EntryResult, filterParticipatingInAll, type OverallResult, importRuleset } from '@ropescore/rulesets'
import { type DataSources } from '../apollo'
import { Ttl } from '../config'
import { type ScoresheetDoc, type CategoryDoc, type CompetitionEventLookupCode, isTallyScoresheet, type EntryDoc } from '../store/schema'
import { NotFoundError } from '../errors'
import { logger } from './logger'
import { Timestamp } from '@google-cloud/firestore'

function filterLatestScoresheets <T extends Pick<ScoresheetDoc, 'createdAt' | 'excludedAt' | 'competitionEventId' | 'judgeType' | 'judgeId' | 'entryId'>> (scoresheets: T[], entryId: EntryDoc['id'], cEvtDef: CompetitionEventLookupCode): T[] {
  return [...scoresheets]
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())
    .filter(scsh => scsh.entryId === entryId && scsh.excludedAt == null)
    .filter((scsh, idx, arr) =>
      scsh.competitionEventId === cEvtDef &&
      idx === arr.findIndex(s => s.judgeId === scsh.judgeId && s.judgeType === scsh.judgeType)
    )
}

export interface CalculateResultOptions {
  dataSources: DataSources
}
export async function calculateResult (categoryId: CategoryDoc['id'], competitionEventId: CompetitionEventLookupCode, { dataSources }: CalculateResultOptions): Promise<{ maxEntryLockedAt: Timestamp | null, results: OverallResult[] | EntryResult[] }> {
  // Get category for options, also in future to find custom events
  const category = await dataSources.categories.findOneById(categoryId, { ttl: Ttl.Long })
  if (!category) throw new NotFoundError('Category not found')

  // Detect overall
  let overall: Overall | undefined
  let competitionEventIds = [competitionEventId]
  try {
    overall = await importPreconfiguredOverall(competitionEventId)
    competitionEventIds = overall.competitionEvents
  } catch (err) {
    logger.error(err)
  }

  // In the future, also handle custom events
  const models: Record<CompetitionEventLookupCode, CompetitionEvent> = Object.fromEntries(await Promise.all(competitionEventIds.map(async competitionEventId => [competitionEventId, await importPreconfiguredCompetitionEvent(competitionEventId)])))

  // Get all locked entries for competitionEventId || overall.competitionEventIds
  const entries = (await dataSources.entries.findManyByCategory({ categoryId, competitionEventId: competitionEventIds.length === 1 ? competitionEventIds[0] : undefined }))
    .filter(entry => entry.didNotSkipAt == null && entry.lockedAt != null && competitionEventIds.includes(entry.competitionEventId))
  // Get judges via judge assignments
  const judgeAssignments = (await dataSources.judgeAssignments.findManyByCategory(categoryId))
    .filter(jA => competitionEventIds.includes(jA.competitionEventId))
  // Get latest non-excluded scoresheet for entries and filter so we are
  // absolutely sure we only have scoresheets for the judges we have assigned
  const scoresheets = (await dataSources.scoresheets.findManyByEntries({ entryIds: entries.map(e => e.id) }))
    .filter(scsh => judgeAssignments.find(jA => jA.judgeId === scsh.judgeId && jA.judgeType === scsh.judgeType && jA.competitionEventId === scsh.competitionEventId && (jA.pool == null || jA.pool === entries.find(entry => entry.id === scsh.entryId)?.pool)) != null)

  // calculate max locked at included in this batch
  let maxEntryLockedAt: Timestamp | null = null
  try {
    maxEntryLockedAt = Timestamp.fromMillis(Math.max(...entries.map(e => e.lockedAt!.toMillis())))
  } catch {}

  let entryResults: EntryResult[] = []
  for (const competitionEventId of competitionEventIds) {
    const ents = entries.filter(entry => entry.competitionEventId === competitionEventId)
    const model = models[competitionEventId]
    const judgeTypes = Object.fromEntries(model.judges.map(j => {
      // TODO: apply config
      const judge = j({})
      return [judge.id, judge]
    }))

    for (const entry of ents) {
      // calculate judge scores
      const latestScoresheets = filterLatestScoresheets(scoresheets, entry.id, competitionEventId)
      const judgeScores = latestScoresheets.map(scsh => judgeTypes[scsh.judgeType].calculateScoresheet({
        meta: {
          judgeId: scsh.judgeId,
          judgeTypeId: scsh.judgeType,
          entryId: scsh.entryId,
          competitionEvent: scsh.competitionEventId,
          participantId: entries.find(entry => entry.id === scsh.entryId)!.participantId
        },
        ...(isTallyScoresheet(scsh)
          ? { tally: scsh.tally }
          : { marks: scsh.marks }
        )
      }))
      // TODO: verify that all judges have scored/pass panel config to scoring model
      logger.info({ judgeScores }, 'judge scores')
      // calculate entry scores
      const result = model.calculateEntry({
        entryId: entry.id,
        participantId: entry.participantId,
        competitionEvent: competitionEventId
        // TODO: apply config
      }, judgeScores, {})
      if (result != null) entryResults.push(result)
    }
  }

  // if overall filter who's in all events
  if (overall != null) entryResults = filterParticipatingInAll(entryResults, overall.competitionEvents)

  // rank entries by competitionEvent
  const ranked: EntryResult[] = []
  for (const competitionEventId of competitionEventIds) {
    const model = models[competitionEventId]
    // TODO: apply config
    ranked.push(...model.rankEntries(entryResults.filter(er => er.meta.competitionEvent === competitionEventId), {}))
  }

  if (overall == null) {
    return {
      maxEntryLockedAt,
      results: ranked
    }
  } else {
    // if overall: rank overall
    return {
      maxEntryLockedAt,
      // TODO: apply config
      results: overall.rankOverall(ranked, {})
    }
  }
}

export interface GetMaxEntryLockedAtOptions {
  dataSources: DataSources
}
export async function getMaxEntryLockedAt (categoryId: CategoryDoc['id'], competitionEventId: CompetitionEventLookupCode, { dataSources }: GetMaxEntryLockedAtOptions): Promise<Timestamp | null> {
  // Get category for rules version, also in future to find custom events
  const category = await dataSources.categories.findOneById(categoryId, { ttl: Ttl.Long })
  if (!category) throw new NotFoundError('Category not found')

  // Detect overall
  let competitionEventIds = [competitionEventId]
  try {
    const overall = await importPreconfiguredOverall(competitionEventId)
    competitionEventIds = overall.competitionEvents
  } catch {}

  let maxEntryLockedAt: Timestamp | null = null
  const entries = await Promise.all(competitionEventIds.map(async competitionEventId => dataSources.entries.findLatestLockedByEvent({ categoryId: category.id, competitionEventId })))
  for (const entry of entries) {
    if (entry?.lockedAt != null && (maxEntryLockedAt == null || entry.lockedAt > maxEntryLockedAt)) {
      maxEntryLockedAt = entry.lockedAt
    }
  }

  return maxEntryLockedAt
}

export interface DetectOverallsOptions {
  dataSources: DataSources
}
export async function detectOveralls (categoryId: CategoryDoc['id'], { dataSources }: DetectOverallsOptions): Promise<CompetitionEventLookupCode[]> {
  // Get category for rules version, also in future to find custom events
  const category = await dataSources.categories.findOneById(categoryId, { ttl: Ttl.Long })
  if (!category) throw new NotFoundError('Category not found')

  try {
    const ruleset = await importRuleset(category.rulesId)
    return ruleset.overalls
      .filter(oa => oa.competitionEvents.every(cEvt => category.competitionEventIds.includes(cEvt)))
      .map(oa => oa.id as CompetitionEventLookupCode)
  } catch {
    return []
  }
}
