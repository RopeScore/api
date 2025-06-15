import type { Timestamp } from '@google-cloud/firestore'
import { ValidationError } from '../errors'
import { type EntryResult, type OverallResult } from '@ropescore/rulesets'

export type CompetitionEventLookupCode = `e.${string}.${'fs' | 'sp' | 'oa'}.${'sr' | 'dd' | 'wh' | 'ts' | 'xd'}.${string}.${number}.${`${number}x${number}` | number}@${string}`
const cEvtRegex = /^e\.[a-z0-9-]+\.(fs|sp|oa)\.(sr|dd|wh|ts|xd)\.[a-z0-9-]+\.\d+\.(\d+(x\d+)?)@[a-z0-9-.]+$/
export function isCompetitionEventLookupCode (x: unknown): x is CompetitionEventLookupCode {
  return typeof x === 'string' && cEvtRegex.test(x)
}

export enum CategoryType {
  Team = 'team',
  Individual = 'individual',
}

export enum DeviceStreamShareStatus {
  Pending = 'pending',
  Accepted = 'accepted',
}

export enum ResultVersionType {
  Private = 'private',
  Public = 'public',
  Temporary = 'temporary',
}

export enum ResultVisibilityLevel {
  Private = 'private',
  PublicVersions = 'public-versions',
  // LiveUntilVersioned = 'live-until-versioned',
  Live = 'live',
}

export interface DocBase {
  readonly id: string
  readonly collection: string
  readonly createdAt: Timestamp
  readonly updatedAt: Timestamp
}

export interface Mark {
  timestamp: number // not firebase timestamps here, this is a mostly opaque JSON blob to the server
  sequence: number
  schema: string
  [prop: string]: any
}
function isObject (x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && !Array.isArray(x) && x !== null
}
export function validateMark (mark: unknown): mark is Mark {
  if (!isObject(mark)) throw new ValidationError('Invalid mark')
  if (typeof mark.sequence !== 'number') throw new ValidationError('Missing Mark sequence')
  if (typeof mark.timestamp !== 'number') throw new ValidationError('Missing Mark timestamp')
  if (typeof mark.schema !== 'string') throw new ValidationError('No mark schema specified')
  return true
}

export interface EntryDoc extends DocBase {
  readonly collection: 'entries'
  readonly categoryId: CategoryDoc['id']
  readonly participantId: ParticipantDoc['id']

  readonly competitionEventId: CompetitionEventLookupCode

  didNotSkipAt?: Timestamp
  lockedAt?: Timestamp
  lockActionAt?: Timestamp
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
  // Stores the name and version of the application/program who last filled
  // this scoresheet
  submitterProgramVersion?: string | null

  excludedAt?: Timestamp

  // optional feature toggles
  options?: Record<string, unknown> | null
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
  completedAt?: Timestamp
  name: string

  currentHeat?: number
  resultVisibility?: ResultVisibilityLevel

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
  name?: string
  battery?: BatteryStatus
}

export function isDevice (object: any): object is DeviceDoc {
  return object?.collection === 'devices'
}

export interface UserDoc extends DocBase {
  readonly collection: 'users'
  readonly globalAdmin?: boolean

  name?: string
  firebaseAuthId?: string
}
export function isUser (object: any): object is UserDoc {
  return object?.collection === 'users'
}

export interface CategoryDoc extends DocBase {
  readonly collection: 'categories'
  readonly groupId: GroupDoc['id']

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

  options: Record<string, unknown> | null
}

interface ParticipantDocBase extends DocBase {
  readonly collection: 'participants'
  readonly categoryId: CategoryDoc['id']
  readonly type: string

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

interface MarkEventObj {
  readonly sequence: number
  readonly mark: Mark
  readonly tally: ScoreTally
}
export interface StreamMarkEventObj extends MarkEventObj {
  readonly scoresheetId: ScoresheetDoc['id']
}
export interface DeviceStreamMarkEventObjNew extends MarkEventObj {
  readonly deviceId: DeviceDoc['id']

  readonly judgeType: string
  readonly rulesId: string
  readonly competitionEventId: CompetitionEventLookupCode
}
export interface DeviceStreamMarkEventObjOld extends MarkEventObj {
  readonly deviceId: DeviceDoc['id']
}
export type DeviceStreamMarkEventObj = DeviceStreamMarkEventObjNew | DeviceStreamMarkEventObjOld
export interface ServoStreamMarkEventObj extends MarkEventObj {
  readonly streamId: ServoStreamId
}

export interface ScoresheetChangedEventObj {
  entryId: EntryDoc['id']
  scoresheetId: ScoresheetDoc['id']
}

export interface HeatChangedEventObj {
  groupId: GroupDoc['id']
  heat: number
}

// TODO: separate doc type for cache?
// export type EntryResultDoc

export interface RankedResultDoc extends DocBase {
  readonly collection: 'ranked-results'
  readonly categoryId: CategoryDoc['id']
  readonly competitionEventId: CompetitionEventLookupCode

  // This is the max value for lockActionAt of all entries included in these
  // results this is how we determine if the results are stale
  readonly maxEntryLockedAt: Timestamp

  versionType: ResultVersionType
  versionName: string | null
  // versionedAt: Timestamp

  results: EntryResult[] | OverallResult[]
}

export interface ServoDeviceSession {
  deviceSessionId: string
  assignmentCode: ServoAssignmentCode
}
export function isServoDeviceSession (object: any): object is ServoDeviceSession {
  return object != null && typeof object === 'object' && 'assignmentCode' in object
}

export type ServoAssignmentCode = `${number}-${number}`
export type ServoStreamId = `${ServoAssignmentCode}::${string}`
