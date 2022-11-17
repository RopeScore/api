import type { Timestamp } from '@google-cloud/firestore'

export type CompetitionEventLookupCode = `e.${string}.${'fs' | 'sp' | 'oa'}.${'sr' | 'dd' | 'wh' | 'ts' | 'xd'}.${string}.${number}.${`${number}x${number}` | number}`
const cEvtRegex = /e\.[a-z0-9-]+\.(fs|sp|oa)\.(sr|dd|wh|ts|xd)\.[a-z0-9-]+\.\d+\.(\d+(x\d+)?)/
export function isCompetitionEventLookupCode (x: unknown): x is CompetitionEventLookupCode {
  return typeof x === 'string' && cEvtRegex.test(x)
}

export enum CategoryType {
  Team = 'team',
  Individual = 'individual'
}

export enum DeviceStreamShareStatus {
  Pending = 'pending',
  Accepted = 'accepted'
}

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
  readonly categoryId: CategoryDoc['id']
  readonly participantId: ParticipantDoc['id']

  readonly competitionEventId: CompetitionEventLookupCode
  readonly createdAt: Timestamp

  didNotSkipAt?: Timestamp
  lockedAt?: Timestamp
  heat?: number
  pool?: number
}

export interface ScoresheetDocBase extends DocBase {
  readonly collection: 'scoresheets'
  readonly entryId: EntryDoc['id']
  readonly judgeId: JudgeDoc['id']

  // Stored for redundancy/tracing
  readonly rulesId: string
  readonly judgeType: string
  readonly competitionEventId: CompetitionEventLookupCode

  readonly createdAt: Timestamp // server
  updatedAt: Timestamp // server
  deletedAt?: Timestamp

  // optional feature toggles
  options?: Object | null
}

export interface MarkScoresheetDoc extends ScoresheetDocBase {
  // Stored for redundancy/tracing
  readonly deviceId: DeviceDoc['id']

  submittedAt?: Timestamp // server, locks the scoresheet for editing
  openedAt?: Timestamp[] // app
  completedAt?: Timestamp // app

  marks: Mark[]
}
export function isMarkScoresheet (object: any): object is MarkScoresheetDoc {
  return object?.collection === 'scoresheets' && 'marks' in object
}

export type ScoreTally<T extends string = string> = Record<T, number>

export interface TallyScoresheetDoc extends ScoresheetDocBase {
  tally: ScoreTally
}
export function isTallyScoresheet (object: any): object is TallyScoresheetDoc {
  return object?.collection === 'scoresheets' && 'tally' in object
}
export type ScoresheetDoc = MarkScoresheetDoc | TallyScoresheetDoc

export interface GroupDoc extends DocBase {
  readonly collection: 'groups'
  readonly createdAt: Timestamp
  completedAt?: Timestamp
  name: string

  currentHeat?: number

  admins: Array<UserDoc['id']>
  viewers: Array<UserDoc['id']>
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

  name?: string
}
export function isUser (object: any): object is UserDoc {
  return object?.collection === 'users'
}

export interface CategoryDoc extends DocBase {
  readonly collection: 'categories'
  readonly groupId: GroupDoc['id']

  readonly createdAt: Timestamp
  updatedAt: Timestamp

  name: string
  rulesId: string
  type: CategoryType
  competitionEventIds: CompetitionEventLookupCode[]
  // TODO: logo?: string

  pagePrintConfig?: Record<CompetitionEventLookupCode, { zoom?: number, exclude?: boolean }>
}

export interface JudgeDoc extends DocBase {
  readonly collection: 'judges'
  readonly groupId: GroupDoc['id']

  deviceId?: DeviceDoc['id']

  name: string
  ijruId?: string

  scoresheetsLastFetchedAt?: Timestamp
}

export interface JudgeAssignmentDoc extends DocBase {
  readonly collection: 'judge-assignments'
  readonly judgeId: JudgeDoc['id']
  readonly categoryId: CategoryDoc['id']

  readonly competitionEventId: CompetitionEventLookupCode
  readonly judgeType: string

  pool?: number

  options: Object | null
}

interface ParticipantDocBase extends DocBase {
  readonly collection: 'participants'
  readonly categoryId: CategoryDoc['id']
  readonly type: 'team' | 'athlete'
  readonly createdAt: Timestamp

  name: string
  club?: string
  country?: string
}

export interface AthleteDoc extends ParticipantDocBase {
  readonly type: 'athlete'
  ijruId?: string
}
export function isAthlete (object: any): object is TeamDoc {
  return object?.collection === 'participants' && object?.type === 'athlete'
}

export interface TeamDoc extends ParticipantDocBase {
  readonly type: 'team'
  members: string[]
}
export function isTeam (object: any): object is TeamDoc {
  return object?.collection === 'participants' && object?.type === 'team'
}

export type ParticipantDoc = AthleteDoc | TeamDoc

export interface DeviceStreamShareDoc extends DocBase {
  readonly collection: 'device-shares'
  readonly deviceId: DeviceDoc['id']
  readonly userId: UserDoc['id']

  status: DeviceStreamShareStatus
  expiresAt: Timestamp
}
