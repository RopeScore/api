import { gql } from 'apollo-server'

const typeDefs = gql`
  scalar JSON
  scalar Timestamp

  union UserDevice = User | Device

  type Query {
    me: UserDevice

    # Get an access group you're part of
    getGroup (id: ID!): Group
    # List access groups you're part of
    getGroups: [Group]!
  }

  type Mutation {
    createUser (secret: String!): User

    createGroup (name: String!): Group
    addGroupViewer (groupId: ID!, userId: ID!): Group
    removeGroupViewer (groupId: ID!, userId: ID!): Group

    createGroupDevice (groupId: ID!, secret: String!): Device

    # createScoresheets (scoresheets: [Scoresheet]): [Scoresheet] # can't use Scoresheet as input type
    # setScoresheetDidNotSkip (scoresheetId: ID!): Scoresheet
    # # order scoresheets

    # submitScoresheet (
    #   scoresheetId: ID!,
    #   openedAt: Timestamp!,
    #   completedAt: Timestamp!
    #   marks: JSON!
    # ): Scoresheet

    # updateDeviceInfo (batteryStatus: BatteryStatus): Device # can't use that as input type
  }

  type Group {
    id: ID!
    name: String!
    admin: User!
    viewers: [User]!

    scoresheets (since: Timestamp): [Scoresheet]!
    devices: [Device]!
  }

  type User {
    id: ID!
  }

  type Device {
    id: ID!
    scoresheetsLastFetchedAt: Timestamp
    battery: BatteryStatus

    group: Group!
    scoresheets (since: Timestamp): [Scoresheet]!
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
    openedAt: Timestamp
    completedAt: Timestamp
    didNotSkip: Boolean

    options: JSON

    marks: JSON
  }
`

export default typeDefs
