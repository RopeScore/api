import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import dotenv from 'dotenv'
import { z } from 'zod'
dotenv.config()

const envSchema = z.object({
  SENTRY_DSN: z.string().url().optional(),
  GCP_PROJECT: z.string(),
  PORT: z.coerce.number().default(3000),
  SECRET_NAME: z.string(),
  JWT_ALG: z.string().default('ES256'),
  JWT_PUBKEY_VERSION: z.string().default('2'),
  JWT_PRIVKEY_VERSION: z.string().default('1'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('trace')
})
const env = envSchema.parse(process.env)

export const {
  SENTRY_DSN,
  GCP_PROJECT,
  PORT,
  SECRET_NAME,
  JWT_ALG,
  JWT_PUBKEY_VERSION,
  JWT_PRIVKEY_VERSION,
  LOG_LEVEL
} = env

const smClient = new SecretManagerServiceClient()
const secretCache = new Map<string, string>()
export async function getSecret (version: string) {
  if (secretCache.has(version)) return secretCache.get(version)
  const [result] = await smClient.accessSecretVersion({
    name: `projects/${GCP_PROJECT}/secrets/${SECRET_NAME}/versions/${version}`
  })

  // Extract the payload as a string.
  const data = result.payload?.data?.toString()
  if (data) secretCache.set(version, data)
  return data
}

export enum Ttl {
  Short = 60,
  Long = 300
}
