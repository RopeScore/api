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
  readonly collection: 'scoresheet'
  // information about the assignment / group of scoresheets
  deviceId: DeviceDoc['id']
  groupId: GroupDoc['id']

  // information to the core system so it knows where to route the results
  readonly categoryId: string
  readonly competitionEventLookupCode: string
  readonly participantId: string
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
  submittedAt?: Timestamp // server
  openedAt?: Timestamp // app
  completedAt?: Timestamp // app
  didNotSkip: boolean

  // optional feature toggles
  options?: Object

  marks: Mark[]
}
export function isScoresheet (object: any): object is DeviceDoc {
  return object.collection === 'scoresheets'
}

export interface GroupDoc extends DocBase {
  readonly collection: 'group'
  readonly admin: UserDoc['id']
  name: string
  viewers: Array<UserDoc['id']>
}
export function isGroup (object: any): object is DeviceDoc {
  return object.collection === 'groups'
}

interface BatteryStatus {
  available: boolean
  charging?: boolean
  batteryLevel?: number
  updatedAt: Timestamp
}

export interface DeviceDoc extends DocBase {
  readonly collection: 'devices'
  readonly secret: string // hashed password, do not expose
  readonly groupId: GroupDoc['id']
  scoresheetsLastFetchedAt?: Timestamp
  battery?: BatteryStatus
}

export function isDevice (object: any): object is DeviceDoc {
  return object.collection === 'devices'
}

export interface UserDoc extends DocBase {
  readonly collection: 'users'
  readonly secret: string // hashed password, do not expose
}
export function isUser (object: any): object is DeviceDoc {
  return object.collection === 'users'
}
