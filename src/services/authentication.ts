import { ApolloError, AuthenticationError } from 'apollo-server'
import { deviceDataSource, userDataSource } from '../store/firestoreDataSource'
import { DeviceDoc, UserDoc } from '../store/schema'
import { pbkdf2 as pbkdf2cb, randomBytes } from 'crypto'
import { promisify } from 'util'
import { Logger } from 'pino'

const pbkdf2 = promisify(pbkdf2cb)

export async function hashPassword (password: string, salt: string = randomBytes(16).toString('hex')): Promise<string> {
  const hash = (await pbkdf2(password, salt, 100, 64, 'sha512')).toString('hex')
  return `${salt}:${hash}`
}

interface HeaderParserOptions {
  logger: Logger
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

  const decoded = Buffer.from(split[1], 'base64').toString('utf-8').split(':')
  if (
    decoded.length !== 3 ||
    !['user', 'device'].includes(decoded[0]) ||
    !decoded[1].length ||
    !decoded[2].length
  ) {
    throw new AuthenticationError('Malformed Authorization header')
  }

  let user: UserDoc | DeviceDoc | undefined
  logger.debug({ type: decoded[0], id: decoded[1] }, 'Finding user or device')
  if (decoded[0] === 'user') user = await userDataSource.findOneById(decoded[1], { ttl: 60 })
  else if (decoded[0] === 'device') user = await deviceDataSource.findOneById(decoded[1], { ttl: 60 })
  else user = undefined

  if (!user) throw new ApolloError('Invalid id or secret')

  const [salt] = user.secret.split(':')
  const result = await hashPassword(decoded[2], salt)

  if (result !== user.secret) throw new AuthenticationError('Invalid id or secret')

  return user
}
