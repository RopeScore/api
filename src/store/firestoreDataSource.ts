import { CollectionReference, Firestore } from '@google-cloud/firestore'
import { FirestoreDataSource } from 'apollo-datasource-firestore'
import { DeviceDoc, GroupDoc, ScoresheetDoc, UserDoc } from './schema'
import { ApolloContext } from '../apollo'

const firestore = new Firestore()

export class ScoresheetDataSource extends FirestoreDataSource<ScoresheetDoc, ApolloContext> {}
export const scoresheetDataSource = new ScoresheetDataSource(firestore.collection('scoresheets') as CollectionReference<ScoresheetDoc>)

export class GroupDataSource extends FirestoreDataSource<GroupDoc, ApolloContext> {}
export const groupDataSource = new GroupDataSource(firestore.collection('groups') as CollectionReference<GroupDoc>)

export class DeviceDataSource extends FirestoreDataSource<DeviceDoc, ApolloContext> {}
export const deviceDataSource = new DeviceDataSource(firestore.collection('devices') as CollectionReference<DeviceDoc>)

export class UserDataSource extends FirestoreDataSource<UserDoc, ApolloContext> {}
export const userDataSource = new UserDataSource(firestore.collection('users') as CollectionReference<UserDoc>)
