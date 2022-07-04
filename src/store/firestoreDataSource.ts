import { Firestore, Timestamp } from '@google-cloud/firestore'
import { FindArgs, FirestoreDataSource } from 'apollo-datasource-firestore'
import { CompetitionEventLookupCode, isDevice, isGroup } from './schema'
import type { ApolloContext } from '../apollo'
import type { DeviceDoc, GroupDoc, ScoresheetDoc, UserDoc, JudgeAssignmentDoc, JudgeDoc, ParticipantDoc, CategoryDoc, EntryDoc } from './schema'
import type { CollectionReference } from '@google-cloud/firestore'
import { logger } from '../services/logger'
import { MutationRegisterDeviceArgs } from '../generated/graphql'
import pLimit from 'p-limit'

const firestore = new Firestore()

const DELETE_CONCURRENCY = 50

// TODO: dataloader deduplicate findManyByQuery ones?

export class ScoresheetDataSource extends FirestoreDataSource<ScoresheetDoc, ApolloContext> {
  async findManyByEntryJudge ({ entryId, judgeId, deviceId }: { entryId: EntryDoc['id'], judgeId?: JudgeDoc['id'], deviceId?: DeviceDoc['id'] }, { since, ttl }: { since?: Timestamp | null } & FindArgs = {}) {
    return await this.findManyByQuery(c => {
      let q = c.where('entryId', '==', entryId)
      if (judgeId) q = q.where('judgeId', '==', judgeId)
      if (deviceId) q = q.where('deviceId', '==', deviceId)
      if (since) q = q.where('updatedAt', '>=', since)
      return q
    }, { ttl })
  }

  async findOneByEntryJudge ({ entryId, judgeId, deviceId }: { entryId: EntryDoc['id'], judgeId: JudgeDoc['id'], deviceId: DeviceDoc['id'] }, { ttl }: FindArgs = {}): Promise<ScoresheetDoc | undefined> {
    const results = await this.findManyByQuery(c => c
      .where('entryId', '==', entryId)
      .where('judgeId', '==', judgeId)
      .where('deviceId', '==', deviceId)
      .orderBy('createdAt', 'desc')
      .limit(1),
    { ttl })

    return results[0]
  }

  async deleteManyByJudgeAssignment ({ judgeId, judgeType, competitionEventId }: Pick<JudgeAssignmentDoc, 'judgeId' | 'judgeType' | 'competitionEventId' | 'categoryId'>, entryIds: Array<EntryDoc['id']>) {
    const scoresheets = await this.findManyByQuery(c => c
      .where('judgeId', '==', judgeId)
      .where('judgeType', '==', judgeType)
      .where('competitionEventId', '==', competitionEventId)
      .where('entryId', 'in', entryIds)
    )

    const limit = pLimit(DELETE_CONCURRENCY)

    await Promise.allSettled(scoresheets.map(async e => limit(async () => this.deleteOne(e.id))))
  }
}
export const scoresheetDataSource = () => new ScoresheetDataSource(firestore.collection('scoresheets') as CollectionReference<ScoresheetDoc>, { logger: logger.child({ name: 'scoresheet-data-source' }) })

export class GroupDataSource extends FirestoreDataSource<GroupDoc, ApolloContext> {
  async findManyByUser (user: UserDoc, { ttl }: FindArgs = {}) {
    const results = await Promise.all([
      this.findManyByQuery(c => c.where('admins', 'array-contains', user.id), { ttl }),
      this.findManyByQuery(c => c.where('viewers', 'array-contains', user.id), { ttl })
    ])

    return results.flat().filter(g => isGroup(g))
  }

  async findOneByJudge (judge: JudgeDoc, { ttl }: FindArgs = {}) {
    return this.findOneById(judge.groupId, { ttl })
  }
}
export const groupDataSource = () => new GroupDataSource(firestore.collection('groups') as CollectionReference<GroupDoc>, { logger: logger.child({ name: 'group-data-source' }) })

export class CategoryDataSource extends FirestoreDataSource<CategoryDoc, ApolloContext> {
  async findManyByGroup (group: GroupDoc, { ttl }: FindArgs = {}) {
    return this.findManyByQuery(c => c.where('groupId', '==', group.id), { ttl })
  }
}
export const categoryDataSource = () => new CategoryDataSource(firestore.collection('categories') as CollectionReference<CategoryDoc>, { logger: logger.child({ name: 'category-data-source' }) })

export class DeviceDataSource extends FirestoreDataSource<DeviceDoc, ApolloContext> {
  async createRandom (device: MutationRegisterDeviceArgs, { ttl }: FindArgs = {}) {
    let id
    // generate an id, test if it exists, retry if it does
    do {
      id = `${Math.round(Math.random() * 1_000_000)}`.padStart(6, '0')
    } while (await this.findOneById(id, { ttl }))

    return this.updateOne({
      id,
      collection: 'devices',
      createdAt: Timestamp.now(),
      ...(device.name ? { name: device.name } : {})
    })
  }
}
export const deviceDataSource = () => new DeviceDataSource(firestore.collection('devices') as CollectionReference<DeviceDoc>, { logger: logger.child({ name: 'device-data-source' }) })

export class UserDataSource extends FirestoreDataSource<UserDoc, ApolloContext> {}
export const userDataSource = () => new UserDataSource(firestore.collection('users') as CollectionReference<UserDoc>, { logger: logger.child({ name: 'user-data-source' }) })

export class JudgeDataSource extends FirestoreDataSource<JudgeDoc, ApolloContext> {
  async findManyByGroup (group: GroupDoc, { ttl }: FindArgs = {}) {
    return this.findManyByQuery(c => c.where('groupId', '==', group.id), { ttl })
  }

  async findManyByDevice (deviceId: DeviceDoc['id'], { ttl }: FindArgs = {}) {
    return await this.findManyByQuery(c => c.where('deviceId', '==', deviceId), { ttl })
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
    if (isDevice(actor)) return this.findOneByDevice({ deviceId: actor.id, groupId }, { ttl })
    else return undefined
  }
}
export const judgeDataSource = () => new JudgeDataSource(firestore.collection('judges') as CollectionReference<JudgeDoc>, { logger: logger.child({ name: 'judge-data-source' }) })

export class JudgeAssignmentDataSource extends FirestoreDataSource<JudgeAssignmentDoc, ApolloContext> {
  async findManyByJudge ({ judgeId, categoryIds }: { judgeId: JudgeDoc['id'], categoryIds: Array<CategoryDoc['id']> }, { ttl }: FindArgs = {}) {
    return this.findManyByQuery(c =>
      c.where('judgeId', '==', judgeId)
        .where('categoryId', 'in', categoryIds)
    )
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
    return this.findManyByQuery(c => c.where('categoryId', '==', categoryId))
  }
}
export const judgeAssignmentDataSource = () => new JudgeAssignmentDataSource(firestore.collection('judge-assignments') as CollectionReference<JudgeAssignmentDoc>, { logger: logger.child({ name: 'judge-assignments-data-source' }) })

export class EntryDataSource extends FirestoreDataSource<EntryDoc, ApolloContext> {
  async findManyByCategory ({ categoryId, competitionEventId }: { categoryId: CategoryDoc['id'], competitionEventId?: CompetitionEventLookupCode | null }, { ttl }: FindArgs = {}) {
    return this.findManyByQuery(c => {
      let q = c.where('categoryId', '==', categoryId)
      if (competitionEventId) q = q.where('competitionEventId', '==', competitionEventId)
      return q
    }, { ttl })
  }

  async findManyByCategories (categoryIds: Array<CategoryDoc['id']>, { ttl }: FindArgs = {}) {
    return this.findManyByQuery(c => c.where('categoryId', 'in', categoryIds), { ttl })
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

  async deleteManyByParticipant (participantId: ParticipantDoc['id']) {
    const entries = await this.findManyByQuery(c => c.where('participantId', '==', participantId))

    const limit = pLimit(DELETE_CONCURRENCY)

    await Promise.allSettled(entries.map(async e => limit(async () => this.deleteOne(e.id))))
  }

  async deleteManyByCategoryNotEvent ({ categoryId, competitionEventIds }: { categoryId: CategoryDoc['id'], competitionEventIds: CompetitionEventLookupCode[] }) {
    const entries = await this.findManyByQuery(c => c.where('categoryId', '==', categoryId).where('competitionEventId', 'not-in', competitionEventIds))

    const limit = pLimit(DELETE_CONCURRENCY)

    await Promise.allSettled(entries.map(async e => limit(async () => this.deleteOne(e.id))))
  }
}
export const entryDataSource = () => new EntryDataSource(firestore.collection('entries') as CollectionReference<EntryDoc>, { logger: logger.child({ name: 'entry-data-source' }) })

export class ParticipantDataSource extends FirestoreDataSource<ParticipantDoc, ApolloContext> {
  async findManyByCategory ({ categoryId }: { categoryId: CategoryDoc['id'] }, { ttl }: FindArgs = {}) {
    return this.findManyByQuery(c => c.where('categoryId', '==', categoryId))
  }
}
export const participantDataSource = () => new ParticipantDataSource(firestore.collection('participants') as CollectionReference<ParticipantDoc>, { logger: logger.child({ name: 'entry-data-source' }) })
