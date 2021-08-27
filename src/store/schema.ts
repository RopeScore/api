import type { Timestamp } from '@google-cloud/firestore'

export interface DocBase {
  readonly id: string
  readonly collection: string
}

interface Mark {
  timestamp: number // not firebase timestamps here, this is a mostly opaque JSON blob to the server
  sequence: number
  schema: string
  [prop: string]: any
}

export interface ScoresheetDoc extends DocBase {
  readonly collection: 'scoresheets'
  // information about the assignment / group of scoresheets
  deviceId: DeviceDoc['id']
  groupId: GroupDoc['id']

  // information to the core system so it knows where to route the results
  // readonly categoryId: string
  readonly competitionEventLookupCode: string
  // readonly participantId: string
  readonly judgeId: string
  readonly rulesId: string
  readonly judgeType: string

  // stuff for display
  readonly participantName: string
  readonly judgeName: string
  readonly categoryName: string

  // some metadata
  createdAt: Timestamp // server
  updatedAt: Timestamp // server
  submittedAt?: Timestamp // server, locks the scoresheet for editing
  openedAt?: Timestamp[] // app
  completedAt?: Timestamp // app
  didNotSkipAt?: Timestamp
  heat: number

  // optional feature toggles
  options?: Object | null

  marks: Mark[]
}
export function isScoresheet (object: any): object is ScoresheetDoc {
  return object?.collection === 'scoresheets'
}

interface ScoresheetFetches {
  [deviceId: string]: Timestamp
}

export interface GroupDoc extends DocBase {
  readonly collection: 'groups'
  readonly admin: UserDoc['id']
  readonly createdAt: Timestamp
  completedAt?: Timestamp
  name: string
  viewers: Array<UserDoc['id']>
  devices: Array<DeviceDoc['id']>
  scoresheetsLastFetchedAt: ScoresheetFetches
}
export function isGroup (object: any): object is GroupDoc {
  return object?.collection === 'groups'
}

interface BatteryStatus {
  automatic: boolean
  charging?: boolean | null
  batteryLevel: number
  updatedAt: Timestamp
}

export interface DeviceDoc extends DocBase {
  readonly collection: 'devices'
  readonly createdAt: Timestamp
  battery?: BatteryStatus
}

export function isDevice (object: any): object is DeviceDoc {
  return object?.collection === 'devices'
}

export interface UserDoc extends DocBase {
  readonly collection: 'users'
  readonly createdAt: Timestamp
  readonly globalAdmin?: Boolean
}
export function isUser (object: any): object is UserDoc {
  return object?.collection === 'users'
}
