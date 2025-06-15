import { verify, sign } from 'jsonwebtoken'
import { jwtVerify, createRemoteJWKSet } from 'jose'
import { GCP_PROJECT, getSecret, JWT_ALG, JWT_PRIVKEY_SECRET, JWT_PUBKEY_SECRET, SERVO_JWKS_ENDPOINT, SERVO_JWT_ISSUER, Ttl } from '../config'
import { LRUCache } from 'lru-cache'
import { AuthenticationError, AuthorizationError, NotFoundError, ValidationError } from '../errors'
import { type DataSources } from '../apollo'
import { auth } from 'firebase-admin'

import type { Logger } from 'pino'
import type { Algorithm } from 'jsonwebtoken'
import { type ServoAssignmentCode, type ServoDeviceSession, isUser, type DeviceDoc, type UserDoc } from '../store/schema'

interface HeaderParserOptions {
  logger: Logger
  dataSources: DataSources
}

interface JWTPayload {
  iss: string
  iat: number
  sub: UserDoc['id']
  scope: Array<'device' | 'user'>
}

interface ServoJWTPayload {
  iss: 'ScoringIssuer'
  iat: number
  exp: number
  nbf: number
  device_session_id: string
  assignment_code: string
}

interface JWTInput {
  sub: JWTPayload['sub']
  scope: JWTPayload['scope']
}

const usersDevicesRollingCache = new LRUCache<`${'d' | 'u' | 'fu'}::${string}`, UserDoc | DeviceDoc, { dataSources: DataSources }>({
  max: 3000,
  ttl: Ttl.Long * 1000,
  ttlAutopurge: false,
  // we want them deleted aka return undefined so that the next check tries
  // again. We only want to cache successes
  noDeleteOnFetchRejection: false,
  async fetchMethod (key, staleValue, { options, context: { dataSources } }) {
    const [type, id] = key.split('::')
    if (type === 'u') return await dataSources.users.findOneById(id)
    else if (type === 'fu') return await dataSources.users.findOneByFirebaseAuthId(id)
    else return await dataSources.devices.findOneById(id)
  },
})

const servoJwks = createRemoteJWKSet(new URL(SERVO_JWKS_ENDPOINT))
export async function servoDeviceSessionFromServoAuthorizationHeader (header: string | undefined, { logger }: HeaderParserOptions): Promise<ServoDeviceSession | undefined> {
  if (header == null || header.trim() === '') return undefined

  const split = header?.split(' ')
  if (
    split.length !== 2 ||
    split[0] !== 'Bearer' ||
    !split[1].length
  ) {
    throw new AuthenticationError('Malformed Servo-Authorization header')
  }

  const decoded = await jwtVerify<ServoJWTPayload>(split[1], servoJwks, {
    issuer: SERVO_JWT_ISSUER,
    clockTolerance: 30,
  })

  if (typeof decoded.payload.assignment_code !== 'string') throw new AuthorizationError('Missing assignment code in authentication')

  return {
    assignmentCode: decoded.payload.assignment_code as ServoAssignmentCode,
    deviceSessionId: decoded.payload.device_session_id,
  }
}

export async function userFromAuthorizationHeader (headers: { authorization?: string, firebaseAuthorization?: string }, { logger, dataSources }: HeaderParserOptions): Promise<UserDoc | DeviceDoc | undefined> {
  try {
    let user: UserDoc | DeviceDoc | undefined
    let firebaseAuthId: string | undefined

    if (headers.firebaseAuthorization) {
      const split = headers.firebaseAuthorization.split(' ')
      if (
        split.length !== 2 ||
        split[0] !== 'Bearer' ||
        !split[1].length
      ) {
        throw new AuthenticationError('Malformed Firebase-Authorization header')
      }

      const decoded = await auth().verifyIdToken(split[1])

      firebaseAuthId = decoded.sub
      user = await usersDevicesRollingCache.fetch(`fu::${firebaseAuthId}`, { context: { dataSources } })

      if (user != null) return user
    }

    if (headers.authorization) {
      const split = headers.authorization.split(' ')
      if (
        split.length !== 2 ||
        split[0] !== 'Bearer' ||
        !split[1].length
      ) {
        throw new AuthenticationError('Malformed Authorization header')
      }

      const pubKey = await getSecret(JWT_PUBKEY_SECRET)
      if (!pubKey) throw new TypeError('Cannot get Public Key')

      const decoded = verify(split[1], pubKey, { algorithms: [JWT_ALG as Algorithm], issuer: GCP_PROJECT, allowInvalidAsymmetricKeyTypes: true }) as JWTPayload

      if (decoded.scope.includes('user') && decoded.scope.includes('device')) throw new AuthorizationError('scope cannot have both user and device')

      logger.debug(decoded, 'Finding user or device')
      if (decoded.scope.includes('user')) user = await usersDevicesRollingCache.fetch(`u::${decoded.sub}`, { context: { dataSources } })
      else if (decoded.scope.includes('device')) user = await usersDevicesRollingCache.fetch(`d::${decoded.sub}`, { context: { dataSources } })
      else user = undefined

      if (!user) throw new NotFoundError('User not found')

      if (isUser(user) && firebaseAuthId != null && user.firebaseAuthId == null) {
        // Link old user with firebase auth
        await dataSources.users.updateOnePartial(user.id, { firebaseAuthId })
      }

      if (user != null) return user
    }

    if (user == null && firebaseAuthId) {
      // If we have a firebase user we haven't seen before, we create them in
      // the database
      user = (await dataSources.users.createOne({
        firebaseAuthId,
      }, { ttl: Ttl.Short }))!

      return user
    }

    logger.debug('Unauthenticated request')
  } catch (err) {
    logger.error(err)
    throw err
  }
}

export async function createJWT (payload: JWTInput) {
  if (payload.scope.includes('user') && payload.scope.includes('device')) throw new ValidationError('scope cannot have both user and device')

  const privKey = await getSecret(JWT_PRIVKEY_SECRET)
  if (!privKey) throw new TypeError('Cannot get Private Key')

  return sign(payload, privKey, { algorithm: JWT_ALG as Algorithm, issuer: GCP_PROJECT, allowInvalidAsymmetricKeyTypes: true })
}
