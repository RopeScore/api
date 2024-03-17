import { PubSub } from 'graphql-firebase-subscriptions'

export const pubSub = new PubSub({ localCache: true })

export enum RsEvents {
  MARK_ADDED = 'MARK_ADDED',
  DEVICE_MARK_ADDED = 'DEVICE_MARK_ADDED',
  HEAT_CHANGED = 'HEAT_CHANGED',
  SCORESHEET_CHANGED = 'SCORESHEET_CHANGED'
}
