import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import dotenv from 'dotenv'
dotenv.config()

export const {
  SENTRY_DSN,
  GCP_PROJECT,
  PORT = 3000,
  SECRET_NAME,
  JWT_ALG = 'ES256',
  JWT_PUBKEY_VERSION = '2',
  JWT_PRIVKEY_VERSION = '1'
} = process.env

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
