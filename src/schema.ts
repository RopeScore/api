import { gql } from 'apollo-server'

const typeDefs = gql`
  scalar JSON
  scalar Timestamp

  union UserDevice = User | Device

  type Query {
    me: UserDevice

    # Get an access group you're part of
    group (id: ID!): Group
    # List access groups you're part of
    groups (includeCompleted: Boolean): [Group]!
  }

  type Mutation {
    # returns a JWT
    registerUser: String
    # returns a JWT
    registerDevice: String

    createGroup (name: String!): Group
    completeGroup (groupId: ID!): Group

    addGroupViewer (groupId: ID!, userId: ID!): Group
    removeGroupViewer (groupId: ID!, userId: ID!): Group

    addGroupDevice (groupId: ID!, deviceId: ID!): Group
    removeGroupDevice (groupId: ID!, deviceId: ID!): Group

    # createScoresheets (groupId: ID!, scoresheets: [ScoresheetInput]): [Scoresheet] # can't use Scoresheet as input type
    # # order scoresheets

    setScoresheetDidNotSkip (scoresheetId: ID!): Scoresheet
    fillScoresheet (
      scoresheetId: ID!,
      openedAt: Timestamp,
      completedAt: Timestamp
      marks: [JSON]
    ): Scoresheet

    # updateDeviceInfo (batteryStatus: BatteryStatus): Device # can't use that as input type
  }

  type Group {
    id: ID!
    name: String!
    admin: User!
    viewers: [User]!
    devices: [Device]!

    scoresheets (since: Timestamp): [Scoresheet]!
  }

  type User {
    id: ID!
  }

  type Device {
    id: ID!
    scoresheetsLastFetchedAt: Timestamp
    battery: BatteryStatus
  }

  type BatteryStatus {
    available: Boolean!
    charging: Boolean
    batteryLevel: Int
    updatedAt: Timestamp!
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
    openedAt: [Timestamp]
    completedAt: Timestamp
    didNotSkipAt: Timestamp

    options: JSON

    marks: [JSON]
  }
`

export default typeDefs
