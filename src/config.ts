import dotenv from 'dotenv'
dotenv.config()

export const {
  SENTRY_DSN,
  GCP_PROJECT,
  PORT = 3000
} = process.env
