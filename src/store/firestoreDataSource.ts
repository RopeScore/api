import { Firestore, Timestamp } from '@google-cloud/firestore'
import { FindArgs, FirestoreDataSource } from 'apollo-datasource-firestore'
import { isDevice, isGroup } from './schema'
import type { ApolloContext } from '../apollo'
import type { DeviceDoc, GroupDoc, ScoresheetDoc, UserDoc } from './schema'
import type { CollectionReference } from '@google-cloud/firestore'
import { logger } from '../services/logger'

const firestore = new Firestore()

export class ScoresheetDataSource extends FirestoreDataSource<ScoresheetDoc, ApolloContext> {
  async findManyByGroupDevice ({ groupId, deviceId }: { groupId: string, deviceId?: string }, { since, ttl }: { since?: Timestamp | null } & FindArgs = {}) {
    console.log()
    return await this.findManyByQuery(c => {
      let q = c.where('groupId', '==', groupId)
      if (deviceId) q = q.where('deviceId', '==', deviceId)
      if (since) q = q.where('updatedAt', '>=', since)
      return q
    }, { ttl })
  }
}
export const scoresheetDataSource = new ScoresheetDataSource(firestore.collection('scoresheets') as CollectionReference<ScoresheetDoc>, { logger: logger.child({ name: 'scoresheet-data-source' }) })
scoresheetDataSource.initialize()

export class GroupDataSource extends FirestoreDataSource<GroupDoc, ApolloContext> {
  async findManyByUser (user: DeviceDoc | UserDoc, { ttl }: FindArgs = {}) {
    const results = await Promise.all(isDevice(user)
      ? [
          this.findManyByQuery(c => c.where('devices', 'array-contains', user.id), { ttl })
        ]
      : [
          this.findManyByQuery(c => c.where('admin', '==', user.id), { ttl }),
          this.findManyByQuery(c => c.where('viewers', 'array-contains', user.id), { ttl })
        ]
    )

    return results.flat().filter(g => isGroup(g))
  }
}
export const groupDataSource = new GroupDataSource(firestore.collection('groups') as CollectionReference<GroupDoc>, { logger: logger.child({ name: 'group-data-source' }) })
groupDataSource.initialize()

export class DeviceDataSource extends FirestoreDataSource<DeviceDoc, ApolloContext> {
  async findManyByGroupId (groupId: string, { ttl }: FindArgs = {}) {
    return await this.findManyByQuery(c => c.where('groupId', '==', groupId), { ttl })
  }

  async createRandom ({ ttl }: FindArgs = {}) {
    let id
    // generate an id, test if it exists, retry if it does
    do {
      id = `${Math.round(Math.random() * 1_000_000)}`.padStart(6, '0')
    } while (await this.findOneById(id, { ttl }))

    return this.updateOne({
      id,
      collection: 'devices',
      createdAt: Timestamp.now()
    })
  }
}
export const deviceDataSource = new DeviceDataSource(firestore.collection('devices') as CollectionReference<DeviceDoc>, { logger: logger.child({ name: 'device-data-source' }) })
deviceDataSource.initialize()

export class UserDataSource extends FirestoreDataSource<UserDoc, ApolloContext> {}
export const userDataSource = new UserDataSource(firestore.collection('users') as CollectionReference<UserDoc>, { logger: logger.child({ name: 'user-data-source' }) })
userDataSource.initialize()
