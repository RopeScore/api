import { Timestamp } from '@google-cloud/firestore'
import { GraphQLScalarType, Kind } from 'graphql'
import { type CompetitionEventLookupCode, isCompetitionEventLookupCode } from './store/schema'

export const TimestampScalar = new GraphQLScalarType({
  name: 'Timestamp',
  description: 'The `Timestamp` scalar represents a UNIX epoch timestamp in milliseconds',
  serialize (value) {
    return Timestamp.prototype.toMillis.call(value)
  },
  parseValue (value) {
    if (typeof value !== 'number') return null
    return Timestamp.fromMillis(value)
  },
  parseLiteral (ast) {
    if (ast.kind === Kind.INT) {
      return Timestamp.fromMillis(parseInt(ast.value, 10))
    }
    return null
  },
})

export const CompetitionEventLookupCodeScalar = new GraphQLScalarType<CompetitionEventLookupCode | null, string>({
  name: 'CompetitionEventLookupCode',
  description: 'The `CompetitionEventLookupCode` scalar represents an IJRU standard format competition event lookup code',
  serialize (value) {
    if (!isCompetitionEventLookupCode(value)) throw TypeError('Could not serialise competition event lookup code')
    return value
  },
  parseValue (value) {
    if (!isCompetitionEventLookupCode(value)) return null
    return value
  },
  parseLiteral (ast) {
    if (ast.kind === Kind.STRING && isCompetitionEventLookupCode(ast.value)) {
      return ast.value
    }
    return null
  },
})
