import { gql } from 'apollo-server'

const typeDefs = gql`
  scalar JSON
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
    registerDevice: String!

    createGroup (name: String!): Group!
    completeGroup (groupId: ID!): Group!

    addGroupViewer (groupId: ID!, userId: ID!): Group!
    removeGroupViewer (groupId: ID!, userId: ID!): Group!

    addGroupDevice (groupId: ID!, deviceId: ID!): Group!
    removeGroupDevice (groupId: ID!, deviceId: ID!): Group!

    createScoresheets (groupId: ID!, scoresheets: [ScoresheetInput!]!): [Scoresheet!]!
    reorderScoresheet (scoresheetId: ID!, heat: Int!): Scoresheet!

    setScoresheetDidNotSkip (scoresheetId: ID!): Scoresheet!
    fillScoresheet (
      scoresheetId: ID!,
      openedAt: Timestamp,
      completedAt: Timestamp
      marks: [JSON!]
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

    scoresheets (since: Timestamp): [Scoresheet!]!
    scoresheet (scoresheetId: ID!): Scoresheet
  }

  type User {
    id: ID!
  }

  type Device {
    id: ID!
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

  type Scoresheet {
    id: ID!

    device: Device!
    group: Group!

    categoryId: String!
    competitionEventLookupCode: String!
    participantId: String!
    judgeId: String!
    rulesId: String!
    judgeType: String!

    participantName: String!
    judgeName: String!
    categoryName: String!

    createdAt: Timestamp!
    updatedAt: Timestamp!
    submittedAt: Timestamp
    openedAt: [Timestamp!]
    completedAt: Timestamp
    didNotSkipAt: Timestamp
    heat: Int!

    options: JSON

    marks: [JSON!]!
  }

  input ScoresheetInput {
    deviceId: String!

    categoryId: String!
    competitionEventLookupCode: String!
    participantId: String!
    judgeId: String!
    rulesId: String!
    judgeType: String!

    participantName: String!
    judgeName: String!
    categoryName: String!
    heat: Int!

    options: JSON
  }
`

export default typeDefs
