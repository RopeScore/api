import { Firestore } from '@google-cloud/firestore'
import { FirestoreDataSource } from 'apollo-datasource-firestore'
import { isDevice, isGroup } from './schema'
import type { ApolloContext } from '../apollo'
import type { DeviceDoc, GroupDoc, ScoresheetDoc, UserDoc } from './schema'
import type { CollectionReference, Timestamp } from '@google-cloud/firestore'

const firestore = new Firestore()

export class ScoresheetDataSource extends FirestoreDataSource<ScoresheetDoc, ApolloContext> {
  async findManyByDeviceId (deviceId: string, { since, ttl }: { since?: Timestamp | null, ttl?: number } = {}) {
    return await this.findManyByQuery(c => {
      const q = c.where('deviceId', '==', deviceId)
      if (since) q.where('updatedAt', '>=', since)
      return q
    }, { ttl })
  }

  async findManyByGroupId (groupId: string, { since, ttl }: { since?: Timestamp | null, ttl?: number } = {}) {
    return await this.findManyByQuery(c => {
      const q = c.where('groupId', '==', groupId)
      if (since) q.where('updatedAt', '>=', since)
      return q
    }, { ttl })
  }
}
export const scoresheetDataSource = new ScoresheetDataSource(firestore.collection('scoresheets') as CollectionReference<ScoresheetDoc>)
scoresheetDataSource.initialize()

export class GroupDataSource extends FirestoreDataSource<GroupDoc, ApolloContext> {
  async findManyByUser (user: DeviceDoc | UserDoc, { ttl }: { ttl?: number } = {}) {
    const results = await Promise.all(isDevice(user)
      ? [
          this.findOneById(user.groupId, { ttl }).then(g => [g])
        ]
      : [
          this.findManyByQuery(c => c.where('admin', '==', user.id), { ttl }),
          this.findManyByQuery(c => c.where('viewers', 'array-contains', user.id), { ttl })
        ]
    )

    return results.flat().filter(g => isGroup(g)) as GroupDoc[]
  }
}
export const groupDataSource = new GroupDataSource(firestore.collection('groups') as CollectionReference<GroupDoc>)
groupDataSource.initialize()

export class DeviceDataSource extends FirestoreDataSource<DeviceDoc, ApolloContext> {
  async findManyByGroupId (groupId: string, { ttl }: { ttl?: number } = {}) {
    return await this.findManyByQuery(c => c.where('groupId', '==', groupId), { ttl })
  }
}
export const deviceDataSource = new DeviceDataSource(firestore.collection('devices') as CollectionReference<DeviceDoc>)
deviceDataSource.initialize()

export class UserDataSource extends FirestoreDataSource<UserDoc, ApolloContext> {}
export const userDataSource = new UserDataSource(firestore.collection('users') as CollectionReference<UserDoc>)
userDataSource.initialize()
