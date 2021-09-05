import { Firestore, Timestamp } from '@google-cloud/firestore'
import { FindArgs, FirestoreDataSource } from 'apollo-datasource-firestore'
import { EntryDoc, isDevice, isGroup } from './schema'
import type { ApolloContext } from '../apollo'
import type { DeviceDoc, GroupDoc, ScoresheetDoc, UserDoc } from './schema'
import type { CollectionReference } from '@google-cloud/firestore'
import { logger } from '../services/logger'
import { MutationRegisterDeviceArgs } from '../generated/graphql'

const firestore = new Firestore()

export class ScoresheetDataSource extends FirestoreDataSource<ScoresheetDoc, ApolloContext> {
  async findManyByEntryDevice ({ entryId, deviceId }: { entryId: EntryDoc['id'], deviceId?: DeviceDoc['id'] }, { since, ttl }: { since?: Timestamp | null } & FindArgs = {}) {
    return await this.findManyByQuery(c => {
      let q = c.where('entryId', '==', entryId)
      if (deviceId) q = q.where('deviceId', '==', deviceId)
      if (since) q = q.where('updatedAt', '>=', since)
      return q
    }, { ttl })
  }

  async findOneByEntryDevice ({ entryId, deviceId }: { entryId: EntryDoc['id'], deviceId: DeviceDoc['id'] }, { ttl }: FindArgs = {}) {
    const results = await this.findManyByQuery(c => c
      .where('entryId', '==', entryId)
      .where('deviceId', '==', deviceId)
      .orderBy('createdAt', 'desc')
      .limit(1)
    )

    return results[0]
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
export const deviceDataSource = new DeviceDataSource(firestore.collection('devices') as CollectionReference<DeviceDoc>, { logger: logger.child({ name: 'device-data-source' }) })
deviceDataSource.initialize()

export class UserDataSource extends FirestoreDataSource<UserDoc, ApolloContext> {}
export const userDataSource = new UserDataSource(firestore.collection('users') as CollectionReference<UserDoc>, { logger: logger.child({ name: 'user-data-source' }) })
userDataSource.initialize()

export class EntryDataSource extends FirestoreDataSource<EntryDoc, ApolloContext> {}
export const entryDataSource = new EntryDataSource(firestore.collection('entries') as CollectionReference<EntryDoc>, { logger: logger.child({ name: 'entry-data-source' }) })
entryDataSource.initialize()
