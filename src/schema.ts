import gql from 'graphql-tag'

const typeDefs = gql`
  scalar JSONObject
  scalar Timestamp
  scalar CompetitionEventLookupCode

  union Actor = User | Device
  union Participant = Athlete | Team

  enum CategoryType {
    Team
    Individual
  }

  enum DeviceStreamShareStatus {
    Pending
    Accepted
  }

  enum ResultVersionType {
    Private
    Public
    Temporary
  }

  enum ResultVisibilityLevel {
    Private
    PublicVersions
    # TODO: LiveUntilVersioned
    Live
  }

  type Query {
    me: Actor

    # Get an access group you're part of
    group (groupId: ID!): Group
    # List access groups you're part of
    groups (includeCompleted: Boolean): [Group!]!
  }

  type Mutation {
    # returns a JWT
    registerUser (name: String): String!
    updateUser (name: String): User!
    # returns a JWT
    registerDevice (name: String): String!

    # Only accessible as user
    requestDeviceStreamShare (deviceId: ID!): DeviceStreamShare!
    # Only accessible as device
    createDeviceStreamShare (userId: ID!): DeviceStreamShare!
    deleteDeviceStreamShare (userId: ID!): DeviceStreamShare!

    createGroup (data: CreateGroupInput!): Group!
    updateGroup (groupId: ID!, data: UpdateGroupInput!): Group!
    toggleGroupComplete (groupId: ID!, completed: Boolean!): Group!

    addGroupAdmin (groupId: ID!, userId: ID!): Group!
    removeGroupAdmin (groupId: ID!, userId: ID!): Group!
    addGroupViewer (groupId: ID!, userId: ID!): Group!
    removeGroupViewer (groupId: ID!, userId: ID!): Group!

    setCurrentHeat (groupId: ID!, heat: Int!): Group!

    createCategory (groupId: ID!, data: CreateCategoryInput!): Category!
    updateCategory (categoryId: ID!, data: UpdateCategoryInput!): Category!
    deleteCategory (categoryId: ID!): Category!

    setPagePrintConfig (categoryId: ID!, competitionEventId: CompetitionEventLookupCode!, data: SetPagePrintConfigInput!): Category!

    createJudge (groupId: ID!, data: CreateJudgeInput!): Judge!
    updateJudge (judgeId: ID!, data: UpdateJudgeInput!): Judge!
    # TODO deleteJudge (judgeId: ID!): Judge!
    setJudgeDevice (judgeId: ID!, deviceId: ID!): Judge!
    unsetJudgeDevice (judgeId: ID!): Judge!

    createJudgeAssignment (judgeId: ID!, categoryId: ID!, data: CreateJudgeAssignmentInput!): JudgeAssignment!
    updateJudgeAssignment (judgeAssignmentId: ID!, data: UpdateJudgeAssignmentInput!): JudgeAssignment!
    deleteJudgeAssignment (judgeAssignmentId: ID!): JudgeAssignment!

    createAthlete (categoryId: ID!, data: CreateAthleteInput!): Athlete!
    createTeam (categoryId: ID!, data: CreateTeamInput!): Team!
    updateAthlete (participantId: ID!, data: UpdateAthleteInput!): Athlete!
    updateTeam (participantId: ID!, data: UpdateTeamInput!): Team!
    deleteParticipant (participantId: ID!): Participant!

    createEntry (categoryId: ID!, participantId: ID!, data: CreateEntryInput!): Entry!
    reorderEntry (entryId: ID!, heat: Int, pool: Int): Entry!
    toggleEntryLock (entryId: ID!, lock: Boolean!, didNotSkip: Boolean): Entry!

    createMarkScoresheet (entryId: ID!, judgeId: ID!, data: CreateMarkScoresheetInput!): MarkScoresheet!
    createTallyScoresheet (entryId: ID!, judgeId: ID!, data: CreateTallyScoresheetInput!): TallyScoresheet!
    setScoresheetOptions (scoresheetId: ID!, options: JSONObject!): Scoresheet!
    setScoresheetExclusion (scoresheetId: ID!, exclude: Boolean!): Scoresheet!

    fillTallyScoresheet (
      scoresheetId: ID!,
      tally: JSONObject!,
      programVersion: String
    ): TallyScoresheet!
    fillMarkScoresheet (
      scoresheetId: ID!,
      openedAt: Timestamp,
      completedAt: Timestamp
      marks: [JSONObject!],
      programVersion: String
    ): MarkScoresheet!
    # This is intended to be used for live-streaming scores into the system
    # The marks submitted will not be stored in the real scoresheet but will be
    # pushed to anyone subscribing to real-time data.
    # The scoresheet needs to be properly submitted using fillScoresheet with
    # all marks at a later point.
    addStreamMark (scoresheetId: ID!, mark: JSONObject!, tally: JSONObject!): StreamMarkEvent!
    # This is intended to be used for live displaying scores without having
    # entries, heats etc. set uup - just select the devices you want and stream
    # the scores they send in
    addDeviceStreamMark (mark: JSONObject!, tally: JSONObject!, info: DeviceStreamJudgeInfoInput): DeviceStreamMarkEvent!

    updateDeviceStatus (batteryStatus: BatteryStatusInput!): Device!

    setRankedResultVersion (resultId: ID!, type: ResultVersionType!, name: String!): RankedResult!
    removeRankedResultVersion (resultId: ID!): RankedResult!
  }

  type Subscription {
    # Contains at least the base values on a mark: schema, timestamp, sequence
    # and an additional scoresheetId
    streamMarkAdded (scoresheetIds: [ID!]!): StreamMarkEvent!
    # same as streamMarkAdded but with deviceId instead of scoresheetId
    deviceStreamMarkAdded (deviceIds: [ID!]!): DeviceStreamMarkEvent!

    heatChanged (groupId: ID!): Int!
    scoresheetChanged (entryIds: [ID!]!): ID!
    # TODO: what granularity?
    # entryLocked (): ID!
  }

  type Group {
    id: ID!
    name: String!
    createdAt: Timestamp!
    completedAt: Timestamp

    currentHeat: Int
    resultVisibility: ResultVisibilityLevel

    admins: [User!]!
    viewers: [User!]!
    judges: [Judge!]!
    deviceJudge: Judge!

    categories: [Category!]!
    category (categoryId: ID!): Category

    entries: [Entry!]!
    entry (entryId: ID!): Entry
    entriesByHeat (heat: Int!): [Entry!]!
  }

  input CreateGroupInput {
    name: String!
    resultVisibility: ResultVisibilityLevel
  }

  input UpdateGroupInput {
    name: String!
    resultVisibility: ResultVisibilityLevel
  }

  type User {
    id: ID!
    name: String

    streamShares: [DeviceStreamShare!]!
  }

  type Device {
    id: ID!
    name: String
    battery: BatteryStatus
    # judges: [Judge!]!

    streamShares: [DeviceStreamShare!]!
  }

  type BatteryStatus {
    automatic: Boolean!
    charging: Boolean
    batteryLevel: Int!
    updatedAt: Timestamp!
  }

  input BatteryStatusInput {
    automatic: Boolean!
    charging: Boolean
    batteryLevel: Int!
  }

  type DeviceStreamShare {
    id: ID!

    status: DeviceStreamShareStatus!
    expiresAt: Timestamp!

    device: Device!
    user: User!
  }

  type Judge {
    id: ID!

    name: String!
    ijruId: String

    device: Device
    assignments (categoryId: ID): [JudgeAssignment!]!
    group: Group!
  }

  input CreateJudgeInput {
    name: String!
    ijruId: String
  }

  input UpdateJudgeInput {
    name: String
    ijruId: String
  }

  type Category {
    id: ID!

    name: String!
    rulesId: String!
    type: CategoryType!
    competitionEventIds: [CompetitionEventLookupCode!]!

    # TODO: logo: String
    pagePrintConfig: [PagePrintConfig!]!

    group: Group!

    entries (competitionEventId: CompetitionEventLookupCode): [Entry!]!
    entry (entryId: ID!): Entry

    participants: [Participant!]!

    judgeAssignments: [JudgeAssignment!]!

    # This will return all private and public versions of ranked results as well
    # as the latest temporary version (if one newer than the latest private or
    # public) version exists. If needed a new temporary version will be
    # generated.
    # maxVisibility defaults to 'temporary' for viewers and admins and 'public'
    # for unauthorized users - users cannot set a "higher" max visibility than
    # their default, but may request a lower one.
    rankedResults (competitionEventId: CompetitionEventLookupCode, maxVisibility: ResultVersionType, limit: Int, beforeLockedAt: Timestamp): [RankedResult!]!
    rankedResult (resultId: ID!): RankedResult
    # Returns the latest private, public or temporary version of results for the
    # given competition event ID, limited by maxVisibility or the user type's
    # default max visibility.
    # If needed a temporary version will be generated.
    # maxVisibility defaults to 'temporary' for viewers and admins and 'public'
    # for unauthorized users - users cannot set a "higher" max visibility than
    # their default, but may request a lower one.
    latestRankedResult (competitionEventId: CompetitionEventLookupCode!, maxVisibility: ResultVersionType): RankedResult
  }

  type PagePrintConfig {
    competitionEventId: CompetitionEventLookupCode

    zoom: Float
    exclude: Boolean
  }

  input SetPagePrintConfigInput {
    exclude: Boolean
    zoom: Float
  }

  input CreateCategoryInput {
    name: String!
    rulesId: String!
    type: CategoryType!
    competitionEventIds: [CompetitionEventLookupCode!]
  }

  input UpdateCategoryInput {
    name: String
    competitionEventIds: [CompetitionEventLookupCode!]
  }

  type JudgeAssignment {
    id: ID!

    competitionEventId: CompetitionEventLookupCode!
    judgeType: String!
    pool: Int

    options: JSONObject

    judge: Judge!
    category: Category!
  }

  input CreateJudgeAssignmentInput {
    competitionEventId: CompetitionEventLookupCode!
    judgeType: String!
    pool: Int

    options: JSONObject
  }

  input UpdateJudgeAssignmentInput {
    options: JSONObject
  }

  type Athlete {
    id: ID!

    name: String!
    club: String
    country: String
    createdAt: Timestamp!

    ijruId: String

    category: Category!
  }

  input CreateAthleteInput {
    name: String!
    club: String
    country: String
    ijruId: String
  }

  input UpdateAthleteInput {
    name: String
    club: String
    country: String
    ijruId: String
  }

  type Team {
    id: ID!

    name: String!
    club: String
    country: String

    members: [String!]!

    category: Category!
  }

  input CreateTeamInput {
    name: String!
    club: String
    country: String
    members: [String!]!
  }

  input UpdateTeamInput {
    name: String
    club: String
    country: String
    members: [String!]
  }

  type Entry {
    id: ID!
    category: Category!
    participant: Participant!

    competitionEventId: CompetitionEventLookupCode!

    createdAt: Timestamp!
    didNotSkipAt: Timestamp
    lockedAt: Timestamp
    heat: Int
    pool: Int

    scoresheets (since: Timestamp): [Scoresheet!]!
    scoresheet (scoresheetId: ID!): Scoresheet
  }

  input CreateEntryInput {
    competitionEventId: CompetitionEventLookupCode!

    heat: Int
    pool: Int
  }

  interface Scoresheet {
    id: ID!
    entry: Entry!
    judge: Judge!

    # Stuff we duplicate for redundancy
    rulesId: String!
    judgeType: String!
    competitionEventId: CompetitionEventLookupCode!
    # Name and version of the program that was used to last fill this scoresheet
    # please use the form <name>@<version> where version does not include any @
    submitterProgramVersion: String

    createdAt: Timestamp!
    updatedAt: Timestamp!
    deletedAt: Timestamp @deprecated(reason: "use excludedAt")
    # If set the scoresheet should be excluded from all scoring calculations
    excludedAt: Timestamp

    options: JSONObject
  }

  type MarkScoresheet implements Scoresheet {
    id: ID!
    entry: Entry!
    judge: Judge!

    # Stuff we duplicate for redundancy
    rulesId: String!
    device: Device!
    judgeType: String!
    competitionEventId: CompetitionEventLookupCode!
    submitterProgramVersion: String

    createdAt: Timestamp!
    updatedAt: Timestamp!
    openedAt: [Timestamp!]
    completedAt: Timestamp
    submittedAt: Timestamp
    deletedAt: Timestamp
    excludedAt: Timestamp

    options: JSONObject

    marks: [JSONObject!]!
  }

  type TallyScoresheet implements Scoresheet {
    id: ID!
    entry: Entry!
    judge: Judge!

    # Stuff we duplicate for redundancy
    rulesId: String!
    judgeType: String!
    competitionEventId: CompetitionEventLookupCode!
    submitterProgramVersion: String

    createdAt: Timestamp!
    updatedAt: Timestamp!
    deletedAt: Timestamp
    excludedAt: Timestamp

    options: JSONObject

    tally: JSONObject
  }

  input CreateMarkScoresheetInput {
    options: JSONObject
  }

  input CreateTallyScoresheetInput {
    options: JSONObject
    tally: JSONObject
  }

  type StreamMarkEvent {
    sequence: Int!
    mark: JSONObject!
    tally: JSONObject!

    scoresheet: Scoresheet!
  }
  type DeviceStreamMarkEvent {
    sequence: Int!
    mark: JSONObject!
    tally: JSONObject!

    info: DeviceStreamJudgeInfo!
    device: Device!
  }
  input DeviceStreamJudgeInfoInput {
    judgeType: String!
    rulesId: String!
    competitionEventId: CompetitionEventLookupCode!
  }
  type DeviceStreamJudgeInfo {
    judgeType: String
    rulesId: String
    competitionEventId: CompetitionEventLookupCode
  }

  type RankedResult {
    id: ID!
    competitionEventId: CompetitionEventLookupCode!

    maxEntryLockedAt: Timestamp!

    versionType: ResultVersionType!
    versionName: String

    results: [JSONObject!]!
  }
`

export default typeDefs
