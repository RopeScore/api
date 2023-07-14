import { verify, sign } from 'jsonwebtoken'
import { GCP_PROJECT, getSecret, JWT_ALG, JWT_PRIVKEY_VERSION, JWT_PUBKEY_VERSION, Ttl } from '../config'

import type { Logger } from 'pino'
import type { Algorithm } from 'jsonwebtoken'
import type { DeviceDoc, UserDoc } from '../store/schema'
import { LRUCache } from 'lru-cache'
import { AuthenticationError, AuthorizationError, NotFoundError, ValidationError } from '../errors'
import { type DataSources } from '../apollo'

interface HeaderParserOptions {
  logger: Logger
  dataSources: DataSources
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

const usersDevicesRollingCache = new LRUCache<`${'d' | 'u'}::${string}`, UserDoc | DeviceDoc, { dataSources: DataSources }>({
  max: 1000,
  ttl: Ttl.Short * 1000,
  ttlAutopurge: false,
  // we want them deleted aka return undefined so that the next check tries
  // again. We only want to cache successes
  noDeleteOnFetchRejection: false,
  async fetchMethod (key, staleValue, { options, context: { dataSources } }) {
    const [type, id] = key.split('::')
    if (type === 'u') return dataSources.users.findOneById(id)
    else return dataSources.devices.findOneById(id)
  }
})

export async function userFromAuthorizationHeader (header: string | undefined, { logger, dataSources }: HeaderParserOptions) {
  try {
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

    const decoded = verify(split[1], pubKey, { algorithms: [JWT_ALG as Algorithm], issuer: GCP_PROJECT, allowInvalidAsymmetricKeyTypes: true }) as JWTPayload

    if (decoded.scope.includes('user') && decoded.scope.includes('device')) throw new AuthorizationError('scope cannot have both user and device')

    let user: UserDoc | DeviceDoc | undefined
    logger.debug(decoded, 'Finding user or device')
    if (decoded.scope.includes('user')) user = await usersDevicesRollingCache.fetch(`u::${decoded.sub}`, { context: { dataSources } })
    else if (decoded.scope.includes('device')) user = await usersDevicesRollingCache.fetch(`d::${decoded.sub}`, { context: { dataSources } })
    else user = undefined

    if (!user) throw new NotFoundError('User not found')

    return user
  } catch (err) {
    logger.error(err)
    throw err
  }
}

export async function createJWT (payload: JWTInput) {
  if (payload.scope.includes('user') && payload.scope.includes('device')) throw new ValidationError('scope cannot have both user and device')

  const privKey = await getSecret(JWT_PRIVKEY_VERSION)
  if (!privKey) throw new TypeError('Cannot get Private Key')

  return sign(payload, privKey, { algorithm: JWT_ALG as Algorithm, issuer: GCP_PROJECT, allowInvalidAsymmetricKeyTypes: true })
}
