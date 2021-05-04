import dotenv from 'dotenv'
dotenv.config()

export const {
  SENTRY_DSN,
  PORT = 3000
} = process.env
