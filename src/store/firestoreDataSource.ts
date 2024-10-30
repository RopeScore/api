import { Firestore, Timestamp } from '@google-cloud/firestore'
import { type FindArgs, FirestoreDataSource } from 'apollo-datasource-firestore'
import { type CompetitionEventLookupCode, type DeviceStreamShareDoc, isDevice, isGroup, type DeviceDoc, type GroupDoc, type ScoresheetDoc, type UserDoc, type JudgeAssignmentDoc, type JudgeDoc, type ParticipantDoc, type CategoryDoc, type EntryDoc, type RankedResultDoc, type ResultVersionType } from './schema'
import type { CollectionReference } from '@google-cloud/firestore'
import { logger } from '../services/logger'
import { type MutationRegisterDeviceArgs } from '../generated/graphql'
import pLimit from 'p-limit'
import type { KeyValueCache } from '@apollo/utils.keyvaluecache'

const firestore = new Firestore()

const DELETE_CONCURRENCY = 50

// TODO: dataloader deduplicate findManyByQuery ones?

export class ScoresheetDataSource extends FirestoreDataSource<ScoresheetDoc> {
  async findManyByEntryJudge ({ entryId, judgeId, deviceId }: { entryId: EntryDoc['id'], judgeId?: JudgeDoc['id'], deviceId?: DeviceDoc['id'] }, { since, ttl }: { since?: Timestamp | null } & FindArgs = {}) {
    return await this.findManyByQuery(c => {
      let q = c.where('entryId', '==', entryId)
      if (judgeId) q = q.where('judgeId', '==', judgeId)
      if (deviceId) q = q.where('deviceId', '==', deviceId)
      if (since) q = q.where('updatedAt', '>=', since)
      return q
    }, { ttl })
  }

  async findManyByEntries ({ entryIds }: { entryIds: Array<EntryDoc['id']> }, { ttl }: FindArgs = {}) {
    const promises = []
    const chunkSize = 10
    for (let idx = 0; idx < entryIds.length; idx += 10) {
      const entryIdsChunk = entryIds.slice(idx, idx + chunkSize)
      promises.push(this.findManyByQuery(c => c.where('entryId', 'in', entryIdsChunk)))
    }

    return (await Promise.all(promises)).flat()
  }

  async findOneByEntryJudge ({ entryId, judgeId, deviceId }: { entryId: EntryDoc['id'], judgeId: JudgeDoc['id'], deviceId: DeviceDoc['id'] }, { ttl }: FindArgs = {}): Promise<ScoresheetDoc | undefined> {
    const results = await this.findManyByQuery(c => c
      .where('entryId', '==', entryId)
      .where('judgeId', '==', judgeId)
      .where('deviceId', '==', deviceId)
      .limit(1),
    { ttl })

    // sort descending
    results.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis())

    return results[0]
  }

  async deleteManyByJudgeAssignment ({ judgeId, judgeType, competitionEventId }: Pick<JudgeAssignmentDoc, 'judgeId' | 'judgeType' | 'competitionEventId' | 'categoryId'>, entryIds: Array<EntryDoc['id']>) {
    const chunkSize = 10
    const promises = []
    for (let idx = 0; idx < entryIds.length; idx += chunkSize) {
      const entryIdChunk = entryIds.slice(idx, idx + chunkSize)
      const scoresheets = await this.findManyByQuery(c => c
        .where('judgeId', '==', judgeId)
        .where('judgeType', '==', judgeType)
        .where('competitionEventId', '==', competitionEventId)
        .where('entryId', 'in', entryIdChunk)
      )

      const limit = pLimit(DELETE_CONCURRENCY)
      promises.push(...scoresheets.map(async e => await limit(async () => await this.deleteOne(e.id))))
    }

    await Promise.allSettled(promises)
  }
}
export const scoresheetDataSource = (cache: KeyValueCache) => new ScoresheetDataSource(firestore.collection('scoresheets') as CollectionReference<ScoresheetDoc>, { cache, logger: logger.child({ name: 'scoresheet-data-source' }) })

export class GroupDataSource extends FirestoreDataSource<GroupDoc> {
  async findManyByUser (user: UserDoc, { ttl }: FindArgs = {}) {
    const results = await Promise.all([
      this.findManyByQuery(c => c.where('admins', 'array-contains', user.id), { ttl }),
      this.findManyByQuery(c => c.where('viewers', 'array-contains', user.id), { ttl }),
    ])

    return results.flat().filter(g => isGroup(g))
  }

  async findOneByJudge (judge: JudgeDoc, { ttl }: FindArgs = {}) {
    return await this.findOneById(judge.groupId, { ttl })
  }

  async findAll ({ ttl }: FindArgs = {}) {
    return await this.findManyByQuery(c => c, { ttl })
  }
}
export const groupDataSource = (cache: KeyValueCache) => new GroupDataSource(firestore.collection('groups') as CollectionReference<GroupDoc>, { cache, logger: logger.child({ name: 'group-data-source' }) })

export class CategoryDataSource extends FirestoreDataSource<CategoryDoc> {
  async findManyByGroup (group: GroupDoc, { ttl }: FindArgs = {}) {
    return await this.findManyByQuery(c => c.where('groupId', '==', group.id), { ttl })
  }
}
export const categoryDataSource = (cache: KeyValueCache) => new CategoryDataSource(firestore.collection('categories') as CollectionReference<CategoryDoc>, { cache, logger: logger.child({ name: 'category-data-source' }) })

export class DeviceDataSource extends FirestoreDataSource<DeviceDoc> {
  async createRandom (device: MutationRegisterDeviceArgs, { ttl }: FindArgs = {}) {
    let id
    // generate an id, test if it exists, retry if it does
    do {
      id = `${Math.round(Math.random() * 1_000_000)}`.padStart(6, '0')
    } while (await this.findOneById(id, { ttl }))

    return await this.updateOne({
      id,
      collection: 'devices',
      ...(device.name ? { name: device.name } : {}),
    })
  }
}
export const deviceDataSource = (cache: KeyValueCache) => new DeviceDataSource(firestore.collection('devices') as CollectionReference<DeviceDoc>, { cache, logger: logger.child({ name: 'device-data-source' }) })

export class UserDataSource extends FirestoreDataSource<UserDoc> {
  async findOneByFirebaseAuthId (firebaseAuthId: string, { ttl }: FindArgs = {}) {
    const key = `${this.cachePrefix}firebaseAuthId:${firebaseAuthId}`
    const cacheDoc = await this.cache?.get(key)
    if (cacheDoc && ttl) {
      return JSON.parse(cacheDoc, this.reviver) as UserDoc
    }

    const results = await this.findManyByQuery(c => c.where('firebaseAuthId', '==', firebaseAuthId).limit(1), { ttl })

    if (Number.isInteger(ttl) && results[0]) {
      await this.cache?.set(key, JSON.stringify(results[0], this.replacer), { ttl })
    }

    return results[0]
  }
}
export const userDataSource = (cache: KeyValueCache) => new UserDataSource(firestore.collection('users') as CollectionReference<UserDoc>, { cache, logger: logger.child({ name: 'user-data-source' }) })

export class JudgeDataSource extends FirestoreDataSource<JudgeDoc> {
  async findManyByGroup (group: GroupDoc, { ttl }: FindArgs = {}) {
    return await this.findManyByQuery(c => c.where('groupId', '==', group.id).orderBy('name', 'asc'), { ttl })
  }

  async findManyByDevice (deviceId: DeviceDoc['id'], { ttl }: FindArgs = {}) {
    return await this.findManyByQuery(c => c.where('deviceId', '==', deviceId).orderBy('name', 'asc'), { ttl })
  }

  async findOneByDevice ({ deviceId, groupId }: { deviceId: DeviceDoc['id'], groupId: GroupDoc['id'] }, { ttl }: FindArgs = {}): Promise<JudgeDoc | undefined> {
    const key = `${this.cachePrefix}device:${deviceId}-group:${groupId}`

    const cacheDoc = await this.cache?.get(key)
    if (cacheDoc && ttl) {
      return JSON.parse(cacheDoc, this.reviver) as JudgeDoc
    }

    const results = await this.findManyByQuery(c => c
      .where('groupId', '==', groupId)
      .where('deviceId', '==', deviceId)
      .limit(1),
    { ttl })

    if (Number.isInteger(ttl) && results[0]) {
      await this.cache?.set(key, JSON.stringify(results[0], this.replacer), { ttl })
    }

    return results[0]
  }

  async findOneByActor ({ actor, groupId }: { actor: UserDoc | DeviceDoc | undefined, groupId: GroupDoc['id'] }, { ttl }: FindArgs = {}) {
    if (isDevice(actor)) return await this.findOneByDevice({ deviceId: actor.id, groupId }, { ttl })
    else return undefined
  }
}
export const judgeDataSource = (cache: KeyValueCache) => new JudgeDataSource(firestore.collection('judges') as CollectionReference<JudgeDoc>, { cache, logger: logger.child({ name: 'judge-data-source' }) })

export class JudgeAssignmentDataSource extends FirestoreDataSource<JudgeAssignmentDoc> {
  async findManyByJudge ({ judgeId, categoryIds }: { judgeId: JudgeDoc['id'], categoryIds: Array<CategoryDoc['id']> }, { ttl }: FindArgs = {}) {
    return await this.findManyByQuery(c =>
      c.where('judgeId', '==', judgeId)
        .where('categoryId', 'in', categoryIds)
    )
  }

  async findManyByJudges ({ judgeIds, categoryId, competitionEventId }: { judgeIds: Array<JudgeDoc['id']>, categoryId: CategoryDoc['id'], competitionEventId: CompetitionEventLookupCode }, { ttl }: FindArgs = {}) {
    const promises = []
    const chunkSize = 10
    for (let idx = 0; idx < judgeIds.length; idx += 10) {
      const judgeIdsChunk = judgeIds.slice(idx, idx + chunkSize)
      promises.push(this.findManyByQuery(c =>
        c.where('judgeId', 'in', judgeIdsChunk)
          .where('competitionEventId', '==', competitionEventId)
          .where('categoryId', '==', categoryId)
      ))
    }

    return (await Promise.all(promises)).flat()
  }

  async findOneByJudge ({ judgeId, categoryId, competitionEventId }: { judgeId: JudgeDoc['id'], categoryId: CategoryDoc['id'], competitionEventId: CompetitionEventLookupCode }, { ttl }: FindArgs = {}): Promise<JudgeAssignmentDoc | undefined> {
    const results = await this.findManyByQuery(c =>
      c.where('judgeId', '==', judgeId)
        .where('categoryId', '==', categoryId)
        .where('competitionEventId', '==', competitionEventId)
        .limit(1)
    )

    return results[0]
  }

  async findManyByCategory (categoryId: CategoryDoc['id'], { ttl }: FindArgs = {}) {
    return await this.findManyByQuery(c => c.where('categoryId', '==', categoryId))
  }

  async deleteManyByCategoryNotEvent ({ categoryId, competitionEventIds }: { categoryId: CategoryDoc['id'], competitionEventIds: CompetitionEventLookupCode[] }) {
    const entries = await this.findManyByQuery(c => c.where('categoryId', '==', categoryId).where('competitionEventId', 'not-in', competitionEventIds))

    const limit = pLimit(DELETE_CONCURRENCY)

    await Promise.allSettled(entries.map(async e => await limit(async () => await this.deleteOne(e.id))))
  }
}
export const judgeAssignmentDataSource = (cache: KeyValueCache) => new JudgeAssignmentDataSource(firestore.collection('judge-assignments') as CollectionReference<JudgeAssignmentDoc>, { cache, logger: logger.child({ name: 'judge-assignments-data-source' }) })

export class EntryDataSource extends FirestoreDataSource<EntryDoc> {
  async findManyByCategory ({ categoryId, competitionEventId }: { categoryId: CategoryDoc['id'], competitionEventId?: CompetitionEventLookupCode | null }, { ttl }: FindArgs = {}) {
    const entries = await this.findManyByQuery(c => {
      let q = c.where('categoryId', '==', categoryId)
      if (competitionEventId) q = q.where('competitionEventId', '==', competitionEventId)
      return q
    }, { ttl })
    // sort ascending
    entries.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())
    return entries
  }

  async findManyByCategories (categoryIds: Array<CategoryDoc['id']>, { ttl }: FindArgs = {}) {
    return await this.findManyByQuery(c => c.where('categoryId', 'in', categoryIds), { ttl })
  }

  async findManyByHeat ({ categoryIds, heat }: { categoryIds: Array<CategoryDoc['id']>, heat: number }, { ttl }: FindArgs = {}) {
    return await this.findManyByQuery(c => c
      .where('categoryId', 'in', categoryIds)
      .where('heat', '==', heat)
    )
  }

  async findOneByParticipantEvent ({ categoryId, participantId, competitionEventId }: { categoryId: CategoryDoc['id'], participantId: ParticipantDoc['id'], competitionEventId: CompetitionEventLookupCode }, { ttl }: FindArgs = {}) {
    const results = await this.findManyByQuery(c => c
      .where('categoryId', '==', categoryId)
      .where('participantId', '==', participantId)
      .where('competitionEventId', '==', competitionEventId)
    )

    return results[0]
  }

  async findLatestLockActionByEvent ({ categoryId, competitionEventId }: { categoryId: CategoryDoc['id'], competitionEventId: CompetitionEventLookupCode }): Promise<EntryDoc | undefined> {
    const results = await this.findManyByQuery(c => c
      .where('categoryId', '==', categoryId)
      .where('competitionEventId', '==', competitionEventId)
      .orderBy('lockActionAt', 'desc')
      .limit(1)
    )

    return results[0]
  }

  async deleteManyByParticipant (participantId: ParticipantDoc['id']) {
    const entries = await this.findManyByQuery(c => c.where('participantId', '==', participantId))

    const limit = pLimit(DELETE_CONCURRENCY)

    await Promise.allSettled(entries.map(async e => await limit(async () => await this.deleteOne(e.id))))
  }

  async deleteManyByCategoryNotEvent ({ categoryId, competitionEventIds }: { categoryId: CategoryDoc['id'], competitionEventIds: CompetitionEventLookupCode[] }) {
    const entries = await this.findManyByQuery(c => c.where('categoryId', '==', categoryId).where('competitionEventId', 'not-in', competitionEventIds))

    const limit = pLimit(DELETE_CONCURRENCY)

    await Promise.allSettled(entries.map(async e => await limit(async () => await this.deleteOne(e.id))))
  }
}
export const entryDataSource = (cache: KeyValueCache) => new EntryDataSource(firestore.collection('entries') as CollectionReference<EntryDoc>, { cache, logger: logger.child({ name: 'entry-data-source' }) })

export class ParticipantDataSource extends FirestoreDataSource<ParticipantDoc> {
  async findManyByCategory ({ categoryId }: { categoryId: CategoryDoc['id'] }, { ttl }: FindArgs = {}) {
    const participants = await this.findManyByQuery(c => c.where('categoryId', '==', categoryId))
    // sort ascending
    participants.sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())
    return participants
  }
}
export const participantDataSource = (cache: KeyValueCache) => new ParticipantDataSource(firestore.collection('participants') as CollectionReference<ParticipantDoc>, { cache, logger: logger.child({ name: 'participant-data-source' }) })

export class DeviceStreamShareDataSource extends FirestoreDataSource<DeviceStreamShareDoc> {
  async findOneByDeviceUser ({ deviceId, userId }: { deviceId: DeviceDoc['id'], userId: UserDoc['id'] }, { ttl }: FindArgs = {}) {
    const key = `${this.cachePrefix}device:${deviceId}-user:${userId}`

    const cacheDoc = await this.cache?.get(key)
    if (cacheDoc && Number.isInteger(ttl)) {
      const doc = JSON.parse(cacheDoc, this.reviver) as DeviceStreamShareDoc
      if (doc.expiresAt.toMillis() > Date.now()) return doc
    }

    const results = await this.findManyByQuery(c => c
      .where('deviceId', '==', deviceId)
      .where('userId', '==', userId)
      .where('expiresAt', '>=', Timestamp.now())
      .orderBy('expiresAt', 'desc')
      .limit(1)
    )

    if (Number.isInteger(ttl) && results[0]) {
      await this.cache?.set(key, JSON.stringify(results[0], this.replacer), { ttl })
    }

    return results[0]
  }

  async findManyByUser ({ userId }: { userId: UserDoc['id'] }) {
    return await this.findManyByQuery(c => c
      .where('userId', '==', userId)
      .where('expiresAt', '>=', Timestamp.now())
      .orderBy('expiresAt', 'desc')
    )
  }

  async findManyByDevice ({ deviceId }: { deviceId: DeviceDoc['id'] }) {
    return await this.findManyByQuery(c => c
      .where('deviceId', '==', deviceId)
      .where('expiresAt', '>=', Timestamp.now())
      .orderBy('expiresAt', 'desc')
    )
  }

  async deleteManyByDeviceUser ({ deviceId, userId }: { deviceId: DeviceDoc['id'], userId: UserDoc['id'] }) {
    const shares = await this.findManyByQuery(c => c.where('deviceId', '==', deviceId).where('userId', '==', userId))
    const key = `${this.cachePrefix}device:${deviceId}-user:${userId}`
    await this.cache?.delete(key)

    const limit = pLimit(DELETE_CONCURRENCY)

    await Promise.allSettled(shares.map(async e => await limit(async () => await this.deleteOne(e.id))))
  }
}
export const deviceStreamShareDataSource = (cache: KeyValueCache) => new DeviceStreamShareDataSource(firestore.collection('device-stream-shares') as CollectionReference<DeviceStreamShareDoc>, { cache, logger: logger.child({ name: 'device-stream-share-data-source' }) })

export class RankedResultDataSource extends FirestoreDataSource<RankedResultDoc> {
  async findLatestByCompetitionEvent ({ categoryId, competitionEventId, versionTypes }: { categoryId: CategoryDoc['id'], competitionEventId: CompetitionEventLookupCode, versionTypes: ResultVersionType[] }): Promise<RankedResultDoc | undefined> {
    const result = await this.findManyByQuery(c => c
      .where('categoryId', '==', categoryId)
      .where('competitionEventId', '==', competitionEventId)
      .where('versionType', 'in', versionTypes)
      .orderBy('maxEntryLockedAt', 'desc')
      .limit(1)
    )
    return result[0]
  }

  async findManyByCategory ({ categoryId, competitionEventId, versionTypes, limit, startAfter }: { categoryId: CategoryDoc['id'], competitionEventId?: CompetitionEventLookupCode | null, versionTypes: ResultVersionType[], limit?: number | null, startAfter?: Timestamp | null }) {
    return await this.findManyByQuery(c => {
      let q = c
        .where('categoryId', '==', categoryId)
        .where('versionType', 'in', versionTypes)
      if (competitionEventId != null) q = q.where('competitionEventId', '==', competitionEventId)
      q = q.orderBy('maxEntryLockedAt', 'desc')
      if (limit != null) q = q.limit(limit)
      if (startAfter != null) q = q.startAfter(startAfter)
      return q
    })
  }

  async deleteManyByCategoryNotEvent ({ categoryId, competitionEventIds }: { categoryId: CategoryDoc['id'], competitionEventIds: CompetitionEventLookupCode[] }) {
    const results = await this.findManyByQuery(c => c.where('categoryId', '==', categoryId).where('competitionEventId', 'not-in', competitionEventIds))

    const limit = pLimit(DELETE_CONCURRENCY)

    await Promise.allSettled(results.map(async e => await limit(async () => await this.deleteOne(e.id))))
  }
}
export const rankedResultDataSource = (cache: KeyValueCache) => new RankedResultDataSource(firestore.collection('ranked-results') as CollectionReference<RankedResultDoc>, { cache, logger: logger.child({ name: 'ranked-result-data-source' }) })
