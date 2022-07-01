import { gql } from 'apollo-server-express'

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

  type Query {
    me: Actor

    # Get an access group you're part of
    group (groupId: ID!): Group
    # List access groups you're part of
    groups (includeCompleted: Boolean): [Group!]!
  }

  type Mutation {
    # returns a JWT
    registerUser: String!
    # returns a JWT
    registerDevice (name: String): String!

    createGroup (data: CreateGroupInput!): Group!
    updateGroup (groupId: ID!, data: UpdateGroupInput!): Group!
    completeGroup (groupId: ID!): Group!

    addGroupAdmin (groupId: ID!, userId: ID!): Group!
    removeGroupAdmin (groupId: ID!, userId: ID!): Group!
    addGroupViewer (groupId: ID!, userId: ID!): Group!
    removeGroupViewer (groupId: ID!, userId: ID!): Group!

    setCurrentHeat (groupId: ID!, heat: Int!): Group!

    createCategory (groupId: ID!, data: CreateCategoryInput!): Group!
    updateCategory (categoryId: ID!, data: UpdateCategoryInput!): Category!
    deleteCategory (categoryId: ID!): Category!

    createJudge (groupId: ID!, data: CreateJudgeInput!): Group!
    updateJudge (judgeId: ID!, data: UpdateJudgeInput!): Judge!
    # TODO deleteJudge (judgeId: ID!): Judge!
    setJudgeDevice (judgeId: ID!, deviceId: ID!): Judge!
    unsetJudgeDevice (judgeId: ID!): Judge!

    createJudgeAssignment (judgeId: ID!, categoryId: ID!, data: CreateJudgeAssignmentInput!): Judge!
    updateJudgeAssignment (judgeAssignmentId: ID!, data: UpdateJudgeAssignmentInput!): JudgeAssignment!
    deleteJudgeAssignment (judgeAssignmentId: ID!): JudgeAssignment!

    createAthlete (categoryId: ID!, data: CreateAthleteInput!): Category!
    createTeam (categoryId: ID!, data: CreateTeamInput!): Category!
    updateAthlete (participantId: ID!, data: UpdateAthleteInput!): Athlete!
    updateTeam (participantId: ID!, data: UpdateTeamInput!): Team!
    deleteParticipant (participantId: ID!): Participant!

    createEntry (categoryId: ID!, participantId: ID!, data: CreateEntryInput!): Entry!
    reorderEntry (entryId: ID!, heat: Int, pool: Int): Entry!
    toggleEntryLock (entryId: ID!, lock: Boolean!, didNotSkip: Boolean): Entry!

    createMarkScoresheet (entryId: ID!, judgeId: ID!, data: CreateMarkScoresheetInput!): MarkScoresheet!
    createTallyScoresheet (entryId: ID!, judgeId: ID!, data: CreateTallyScoresheetInput!): TallyScoresheet!
    # setScoresheetOptions (scoresheetId: ID!, options: JSONObject!): Scoresheet!

    fillTallyScoresheet (
      scoresheetId: ID!,
      tally: JSONObject!
    ): TallyScoresheet!
    fillMarkScoresheet (
      scoresheetId: ID!,
      openedAt: Timestamp,
      completedAt: Timestamp
      marks: [JSONObject!]
    ): MarkScoresheet!
    # This is intended to be used for live-streaming scores into the system
    # The marks submitted will not be stored in the real scoresheet but will be
    # pushed to anyone subscribing to real-time data.
    # The scoresheet needs to be properly submitted using fillScoresheet with
    # all marks at a later point.
    addStreamMark (scoresheetId: ID!, mark: JSONObject!): JSONObject!

    updateDeviceStatus (batteryStatus: BatteryStatusInput!): Device!
  }

  type Subscription {
    # Contains at least the base values on a mark: schema, timestamp, sequence
    # and an additional scoresheetId
    streamMarkAdded (scoresheetIds: [ID!]): JSONObject!

    heatChanged (groupId: ID!): Int!
  }

  type Group {
    id: ID!
    name: String!
    createdAt: Timestamp!
    completedAt: Timestamp

    currentHeat: Int

    admins: [User]!
    viewers: [User!]!
    judges: [Judge!]!

    categories: [Category!]!
    category (categoryId: ID!): Category

    entries: [Entry!]!
    entry (entryId: ID!): Entry
    entriesByHeat (heat: Int!): [Entry!]!
  }

  input CreateGroupInput {
    name: String!
  }

  input UpdateGroupInput {
    name: String!
  }

  type User {
    id: ID!
  }

  type Device {
    id: ID!
    name: String
    battery: BatteryStatus
    # judges: [Judge!]!
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

  type Judge {
    id: ID!

    name: String!
    ijruId: String

    device: Device
    assignments: [JudgeAssignment!]!
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
    # TODO print: { logo, exclude, zoom } some local?

    group: Group!

    entries: [Entry!]!
    entry (entryId: ID!): Entry
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

    options: JSONObject

    judge: Judge!
    category: Category!
  }

  input CreateJudgeAssignmentInput {
    competitionEventId: CompetitionEventLookupCode!
    judgeType: String!

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

    competitionEventLookupCode: CompetitionEventLookupCode!

    didNotSkipAt: Timestamp
    lockedAt: Timestamp
    heat: Int!
    pool: Int

    scoresheets (since: Timestamp): [Scoresheet!]!
    scoresheet (scoresheetId: ID!): Scoresheet
    deviceScoresheet: Scoresheet
  }

  input CreateEntryInput {
    competitionEventLookupCode: CompetitionEventLookupCode!

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

    createdAt: Timestamp!
    updatedAt: Timestamp!
    deletedAt: Timestamp

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

    createdAt: Timestamp!
    updatedAt: Timestamp!
    openedAt: [Timestamp!]
    completedAt: Timestamp
    submittedAt: Timestamp
    deletedAt: Timestamp

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

    createdAt: Timestamp!
    updatedAt: Timestamp!
    deletedAt: Timestamp

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
`

export default typeDefs
