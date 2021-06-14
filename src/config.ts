import dotenv from 'dotenv'
import { readFileSync } from 'fs'
dotenv.config()

export const {
  SENTRY_DSN,
  GCP_PROJECT,
  PORT = 3000,
  JWT_ALG
} = process.env

export const JWT_PRIVKEY = readFileSync(process.env.JWT_PRIVKEY_PATH as string, { encoding: 'utf-8' })
export const JWT_PUBKEY = readFileSync(process.env.JWT_PUBKEY_PATH as string, { encoding: 'utf-8' })
