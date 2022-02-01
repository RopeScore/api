import type { Timestamp } from '@google-cloud/firestore'

// export type CompetitionEvent = `e.${string}.${'fs' | 'sp' | 'oa'}.${'sr' | 'dd' | 'wh' | 'ts' | 'xd'}.${string}.${number}.${`${number}x${number}` | number}`

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

export interface EntryDoc extends DocBase {
  readonly collection: 'entries'
  readonly groupId: GroupDoc['id']

  readonly categoryId: string
  readonly categoryName: string

  readonly participantId: string
  readonly participantName: string

  readonly competitionEventLookupCode: string

  didNotSkipAt?: Timestamp
  heat: number
  pool?: number
}

export interface ScoresheetDoc extends DocBase {
  readonly collection: 'scoresheets'
  readonly entryId: EntryDoc['id']
  deviceId: DeviceDoc['id']

  readonly rulesId: string

  readonly judgeId: string
  readonly judgeName: string
  readonly judgeType: string

  readonly createdAt: Timestamp // server
  updatedAt: Timestamp // server
  submittedAt?: Timestamp // server, locks the scoresheet for editing
  openedAt?: Timestamp[] // app
  completedAt?: Timestamp // app
  deletedAt?: Timestamp

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
  name?: string
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
