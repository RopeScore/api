import { mergeResolvers } from '@graphql-tools/merge'

import { CompetitionEventLookupCodeScalar, TimestampScalar } from '../scalars'
import { GraphQLJSONObject } from 'graphql-type-json'

import { CategoryType, DeviceStreamShareStatus, ResultVersionType, ResultVisibilityLevel, isDevice, isMarkScoresheet, isTeam } from '../store/schema'

import { groupResolvers } from './group'
import { userResolvers } from './user'
import { deviceResolvers } from './device'
import { deviceStreamShareResolvers } from './device-stream-share'
import { scoresheetResolvers } from './scoresheet'
import { entryResolvers } from './entry'
import { categoryResolvers } from './category'
import { judgeResolvers } from './judge'
import { judgeAssignmentResolvers } from './judge-assignment'
import { participantResolvers } from './participant'
import { markEventResolvers } from './mark-event'
import { resultResolvers } from './result'

import type { Resolvers } from '../generated/graphql'

export const commonResolvers: Resolvers = {
  // unions
  Actor: {
    __resolveType (obj) {
      if (isDevice(obj)) return 'Device'
      else return 'User'
    },
  },
  Participant: {
    __resolveType (obj) {
      if (isTeam(obj)) return 'Team'
      else return 'Athlete'
    },
  },
  Scoresheet: {
    __resolveType (obj) {
      if (isMarkScoresheet(obj)) return 'MarkScoresheet'
      else return 'TallyScoresheet'
    },
  },
  // scalars
  Timestamp: TimestampScalar,
  CompetitionEventLookupCode: CompetitionEventLookupCodeScalar,
  JSONObject: GraphQLJSONObject,
  // enums
  CategoryType,
  DeviceStreamShareStatus,
  ResultVersionType,
  ResultVisibilityLevel,
}

export const rootResolver = mergeResolvers([
  commonResolvers,
  categoryResolvers,
  deviceResolvers,
  deviceStreamShareResolvers,
  entryResolvers,
  groupResolvers,
  judgeAssignmentResolvers,
  judgeResolvers,
  markEventResolvers,
  participantResolvers,
  scoresheetResolvers,
  userResolvers,
  resultResolvers,
]) as Resolvers
