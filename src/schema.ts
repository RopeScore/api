import { gql } from 'apollo-server-express'

const typeDefs = gql`
  scalar JSONObject
  scalar Timestamp

  union Actor = User | Device

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

    createGroup (name: String!): Group!
    completeGroup (groupId: ID!): Group!

    addGroupViewer (groupId: ID!, userId: ID!): Group!
    removeGroupViewer (groupId: ID!, userId: ID!): Group!

    addGroupDevice (groupId: ID!, deviceId: ID!): Group!
    removeGroupDevice (groupId: ID!, deviceId: ID!): Group!

    createEntry (groupId: ID!, entry: EntryInput!): Entry!
    reorderEntry (entryId: ID!, heat: Int!, pool: Int): Entry!
    setEntryDidNotSkip (entryId: ID!, didNotSkip: Boolean!): Entry!

    createScoresheets (entryId: ID!, scoresheets: [ScoresheetInput!]!): [Scoresheet!]!
    reassignScoresheet (scoresheetId: ID!, deviceId: ID!): Scoresheet!
    setScoresheetOptions (scoresheetId: ID!, options: JSONObject!): Scoresheet!
    deleteScoresheet (scoresheetId: ID!): Scoresheet!

    fillScoresheet (
      scoresheetId: ID!,
      openedAt: Timestamp,
      completedAt: Timestamp
      marks: [JSONObject!]
    ): Scoresheet!
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
  }

  type Group {
    id: ID!
    name: String!
    admin: User!
    viewers: [User!]!
    devices: [Device!]!
    createdAt: Timestamp!
    completedAt: Timestamp

    # scoresheets (since: Timestamp): [Scoresheet!]!
    # scoresheet (scoresheetId: ID!): Scoresheet

    entries: [Entry!]!
    entry (entryId: ID!): Entry
    entriesByHeat (heat: Int!): [Entry!]!
  }

  type User {
    id: ID!
  }

  type Device {
    id: ID!
    name: String
    battery: BatteryStatus
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

  type Entry {
    id: ID!
    group: Group!

    categoryId: String!
    categoryName: String!

    participantId: String!
    participantName: String!

    competitionEventLookupCode: String!

    didNotSkipAt: Timestamp
    heat: Int!
    pool: Int

    scoresheets (since: Timestamp): [Scoresheet!]!
    scoresheet (scoresheetId: ID!): Scoresheet
    deviceScoresheet: Scoresheet
  }

  input EntryInput {
    categoryId: String!
    categoryName: String!

    participantId: String!
    participantName: String!

    competitionEventLookupCode: String!

    heat: Int!
    pool: Int
  }

  type Scoresheet {
    id: ID!
    entry: Entry!
    device: Device!

    rulesId: String!

    judgeId: String!
    judgeName: String!
    judgeType: String!

    createdAt: Timestamp!
    updatedAt: Timestamp!
    openedAt: [Timestamp!]
    completedAt: Timestamp
    submittedAt: Timestamp
    deletedAt: Timestamp

    options: JSONObject

    marks: [JSONObject!]!
  }

  input ScoresheetInput {
    deviceId: String!

    rulesId: String!

    judgeId: String!
    judgeName: String!
    judgeType: String!

    options: JSONObject
  }
`

export default typeDefs
