import { gql } from 'apollo-server'

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
    reorderEntry (entryId: ID!, heat: Int!): Entry!
    setEntryDidNotSkip (entryId: ID!): Entry!

    createScoresheets (entryId: ID!, scoresheets: [ScoresheetInput!]!): [Scoresheet!]!
    reassignScoresheet (scoresheetId: ID!, deviceId: ID!): Scoresheet!
    deleteScoresheet (scoresheetId: ID!): Scoresheet!

    fillScoresheet (
      scoresheetId: ID!,
      openedAt: Timestamp,
      completedAt: Timestamp
      marks: [JSONObject!]
    ): Scoresheet!

    updateDeviceStatus (batteryStatus: BatteryStatusInput!): Device!
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

    scoresheets (since: Timestamp): [Scoresheet!]!
    scoresheet (scoresheetId: ID!): Scoresheet
  }

  input EntryInput {
    categoryId: String!
    categoryName: String!

    participantId: String!
    participantName: String!

    competitionEventLookupCode: String!

    heat: Int!
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
    submittedAt: Timestamp
    openedAt: [Timestamp!]
    completedAt: Timestamp
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
