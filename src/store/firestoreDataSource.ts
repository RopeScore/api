import { Firestore, Timestamp } from '@google-cloud/firestore'
import { FindArgs, FirestoreDataSource } from 'apollo-datasource-firestore'
import { isDevice, isGroup } from './schema'
import type { ApolloContext } from '../apollo'
import type { DeviceDoc, GroupDoc, ScoresheetDoc, UserDoc, JudgeAssignmentDoc, JudgeDoc, ParticipantDoc, CategoryDoc, EntryDoc } from './schema'
import type { CollectionReference } from '@google-cloud/firestore'
import { logger } from '../services/logger'
import { MutationRegisterDeviceArgs } from '../generated/graphql'

const firestore = new Firestore()

export class ScoresheetDataSource extends FirestoreDataSource<ScoresheetDoc, ApolloContext> {
  async findManyByEntryJudge ({ entryId, judgeId }: { entryId: EntryDoc['id'], judgeId?: JudgeDoc['id'] }, { since, ttl }: { since?: Timestamp | null } & FindArgs = {}) {
    return await this.findManyByQuery(c => {
      let q = c.where('entryId', '==', entryId)
      if (judgeId) q = q.where('judgeId', '==', judgeId)
      if (since) q = q.where('updatedAt', '>=', since)
      return q
    }, { ttl })
  }

  async findOneByEntryJudge ({ entryId, judgeId }: { entryId: EntryDoc['id'], judgeId: JudgeDoc['id'] }, { ttl }: FindArgs = {}): Promise<ScoresheetDoc | undefined> {
    const results = await this.findManyByQuery(c => c
      .where('entryId', '==', entryId)
      .where('judgeId', '==', judgeId)
      .orderBy('createdAt', 'desc')
      .limit(1)
    )

    return results[0]
  }
}
export const scoresheetDataSource = () => new ScoresheetDataSource(firestore.collection('scoresheets') as CollectionReference<ScoresheetDoc>, { logger: logger.child({ name: 'scoresheet-data-source' }) })

export class GroupDataSource extends FirestoreDataSource<GroupDoc, ApolloContext> {
  async findManyByUser (user: DeviceDoc | UserDoc, { ttl }: FindArgs = {}) {
    const results = await Promise.all(isDevice(user)
      ? [
          this.findManyByQuery(c => c.where('devices', 'array-contains', user.id), { ttl })
        ]
      : [
          this.findManyByQuery(c => c.where('admins', 'array-contains', user.id), { ttl }),
          this.findManyByQuery(c => c.where('viewers', 'array-contains', user.id), { ttl })
        ]
    )

    return results.flat().filter(g => isGroup(g))
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

  async findOneByDevice ({ deviceId, groupId }: { deviceId: DeviceDoc['id'], groupId: GroupDoc['id'] }, { ttl }: FindArgs = {}): Promise<JudgeDoc | undefined> {
    const results = await this.findManyByQuery(c => c.where('groupId', '==', groupId).where('deviceId', '==', deviceId).limit(1))

    return results[0]
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

  async findOneByJudge ({ judgeId, categoryId }: { judgeId: JudgeDoc['id'], categoryId: CategoryDoc['id'] }, { ttl }: FindArgs = {}): Promise<JudgeAssignmentDoc | undefined> {
    const results = await this.findManyByQuery(c =>
      c.where('judgeId', '==', judgeId)
        .where('categoryId', '==', categoryId)
        .limit(1)
    )

    return results[0]
  }
}
export const judgeAssignmentDataSource = () => new JudgeAssignmentDataSource(firestore.collection('judge-assignments') as CollectionReference<JudgeAssignmentDoc>, { logger: logger.child({ name: 'judge-assignments-data-source' }) })

export class EntryDataSource extends FirestoreDataSource<EntryDoc, ApolloContext> {}
export const entryDataSource = () => new EntryDataSource(firestore.collection('entries') as CollectionReference<EntryDoc>, { logger: logger.child({ name: 'entry-data-source' }) })

export class ParticipantDataSource extends FirestoreDataSource<ParticipantDoc, ApolloContext> {}
export const participantDataSource = () => new ParticipantDataSource(firestore.collection('participants') as CollectionReference<ParticipantDoc>, { logger: logger.child({ name: 'entry-data-source' }) })
