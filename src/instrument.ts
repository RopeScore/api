import * as Sentry from '@sentry/node'
import { SENTRY_DSN } from './config'
import { logger } from './services/logger'

if (SENTRY_DSN) {
  logger.info('Sentry enabled')
  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [
      Sentry.anrIntegration()
    ],
    tracesSampleRate: 1.0
  })
}
