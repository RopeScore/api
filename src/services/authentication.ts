import { ApolloError, AuthenticationError } from 'apollo-server-express'
import { verify, sign } from 'jsonwebtoken'
import { GCP_PROJECT, getSecret, JWT_ALG, JWT_PRIVKEY_VERSION, JWT_PUBKEY_VERSION, Ttl } from '../config'
import { deviceDataSource as getDeviceDataSource, userDataSource as getUserDataSource } from '../store/firestoreDataSource'

import type { Logger } from 'pino'
import type { Algorithm } from 'jsonwebtoken'
import type { DeviceDoc, UserDoc } from '../store/schema'

interface HeaderParserOptions {
  logger: Logger
}

interface JWTPayload {
  iss: string
  iat: number
  sub: UserDoc['id'] | DeviceDoc['id']
  scope: Array<'device' | 'user'>
}

interface JWTInput {
  sub: JWTPayload['sub']
  scope: JWTPayload['scope']
}

export async function userFromAuthorizationHeader (header: string | undefined, { logger }: HeaderParserOptions) {
  if (!header) {
    logger.debug('Unauthenticated request')
    return
  }
  const split = header.split(' ')
  if (
    split.length !== 2 ||
    split[0] !== 'Bearer' ||
    !split[1].length
  ) {
    throw new AuthenticationError('Malformed Authorization header')
  }

  const pubKey = await getSecret(JWT_PUBKEY_VERSION)
  if (!pubKey) throw new TypeError('Cannot get Public Key')

  const decoded = verify(split[1], pubKey, { algorithms: [JWT_ALG as Algorithm], issuer: GCP_PROJECT }) as JWTPayload

  if (decoded.scope.includes('user') && decoded.scope.includes('device')) throw new AuthenticationError('scope cannot have both user and device')

  const userDataSource = getUserDataSource()
  const deviceDataSource = getDeviceDataSource()
  userDataSource.initialize()
  deviceDataSource.initialize()

  let user: UserDoc | DeviceDoc | undefined
  logger.debug(decoded, 'Finding user or device')
  if (decoded.scope.includes('user')) user = await userDataSource.findOneById(decoded.sub, { ttl: Ttl.Short })
  else if (decoded.scope.includes('device')) user = await deviceDataSource.findOneById(decoded.sub, { ttl: Ttl.Short })
  else user = undefined

  if (!user) throw new ApolloError('User not found')

  return user
}

export async function createJWT (payload: JWTInput) {
  if (payload.scope.includes('user') && payload.scope.includes('device')) throw new ApolloError('scope cannot have both user and device')

  const privKey = await getSecret(JWT_PRIVKEY_VERSION)
  if (!privKey) throw new TypeError('Cannot get Private Key')

  return sign(payload, privKey, { algorithm: JWT_ALG as Algorithm, issuer: GCP_PROJECT })
}
