import { mergeResolvers } from '@graphql-tools/merge'

import { CompetitionEventLookupCodeScalar, TimestampScalar } from '../scalars'
import { GraphQLJSONObject } from 'graphql-type-json'

import { CategoryType, isDevice, isTeam } from '../store/schema'

import { groupResolvers } from './group'
import { userResolvers } from './user'
import { deviceResolvers } from './device'
import { scoresheetResolvers } from './scoresheet'
import { entryResolvers } from './entry'
import { categoryResolvers } from './category'
import { judgeResolvers } from './judge'
import { judgeAssignmentResolvers } from './judge-assignment'
import { participantResolvers } from './participant'

import type { Resolvers } from '../generated/graphql'

export const commonResolvers: Resolvers = {
  // unions
  Actor: {
    __resolveType (obj) {
      if (isDevice(obj)) return 'Device'
      else return 'User'
    }
  },
  Participant: {
    __resolveType (obj) {
      if (isTeam(obj)) return 'Team'
      else return 'Athlete'
    }
  },
  // scalars
  Timestamp: TimestampScalar,
  CompetitionEventLookupCode: CompetitionEventLookupCodeScalar,
  JSONObject: GraphQLJSONObject,
  // enums
  CategoryType
}

export const rootResolver = mergeResolvers([
  commonResolvers,
  categoryResolvers,
  deviceResolvers,
  entryResolvers,
  groupResolvers,
  judgeAssignmentResolvers,
  judgeResolvers,
  participantResolvers,
  scoresheetResolvers,
  userResolvers
]) as Resolvers
