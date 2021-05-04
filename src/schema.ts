import { gql } from 'apollo-server'

const typeDefs = gql`
  scalar JSON
  scalar Timestamp

  type Query {
    me: User

    # getGroup (id: ID!): Group
    # getGroups: [Group]!
    getScoresheet (id: ID!): Scoresheet
  }

  # type Mutation {

  # }

  type User {
    id: ID!
  }

  type Scoresheet {
    id: ID!

    deviceId: ID!
    groupId: ID!

    categoryId: ID!
    competitionEventLookupCode: String!
    participantId: String!
    judgeId: ID!
    rulesId: ID!
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
