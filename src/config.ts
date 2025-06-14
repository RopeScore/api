import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import dotenv from 'dotenv'
import { z } from 'zod/v4'
import { initializeApp } from 'firebase-admin/app'
dotenv.config()

initializeApp({
  databaseURL: process.env.FIREBASE_DATABASE_URL,
})

const envSchema = z.object({
  SENTRY_DSN: z.url().optional(),
  GCP_PROJECT: z.string(),
  PORT: z.coerce.number().default(3000),
  JWT_PRIVKEY_SECRET: z.string().default('rs-api-jwtpriv'),
  JWT_PUBKEY_SECRET: z.string().default('rs-api-jwtpub'),
  SERVO_JWT_ISSUER: z.string().default('ScoringIssuer'),
  SERVO_JWKS_ENDPOINT: z.url().default('https://scoring.ijru.sport/.well-known/jwks.json'),
  JWT_ALG: z.string().default('ES256'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('trace'),
})
const env = envSchema.parse(process.env)

export const {
  SENTRY_DSN,
  GCP_PROJECT,
  PORT,
  JWT_PRIVKEY_SECRET,
  JWT_PUBKEY_SECRET,
  SERVO_JWT_ISSUER,
  SERVO_JWKS_ENDPOINT,
  JWT_ALG,
  LOG_LEVEL,
} = env

const smClient = new SecretManagerServiceClient()
const secretCache = new Map<string, string>()
export async function getSecret (secretId: string) {
  if (secretCache.has(secretId)) return secretCache.get(secretId)
  const [result] = await smClient.accessSecretVersion({
    name: `projects/${GCP_PROJECT}/secrets/${secretId}/versions/latest`,
  })

  // Extract the payload as a string.
  const data = result.payload?.data?.toString()
  if (data) secretCache.set(secretId, data)
  return data
}

export enum Ttl {
  Short = 60,
  Long = 300,
}
