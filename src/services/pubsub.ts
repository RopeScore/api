import { initializeApp } from 'firebase-admin/app'
import { PubSub } from 'graphql-firebase-subscriptions'

initializeApp({
  databaseURL: process.env.FIREBASE_DATABASE_URL
})

export const pubSub = new PubSub({ localCache: true })

export enum RsEvents {
  MARK_ADDED = 'MARK_ADDED',
  DEVICE_MARK_ADDED = 'DEVICE_MARK_ADDED',
  HEAT_CHANGED = 'HEAT_CHANGED',
  SCORESHEET_CHANGED = 'SCORESHEET_CHANGED'
}
