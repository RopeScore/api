import pino from 'pino'

// function _levelToSeverity (level) {
//   if (level === logger.useLevelLabels.trace || level === PINO_LEVELS.debug) { return 'debug' }
//   if (level === PINO_LEVELS.info) { return 'info' }
//   if (level === PINO_LEVELS.warn) { return 'warning' }
//   if (level === PINO_LEVELS.error) { return 'error' }
//   if (level >= PINO_LEVELS.fatal) { return 'critical' }
//   return 'default'
// }

export const logger = pino({
  name: '@ropescore/api',
  level: 'warn',
  formatters: {
    level (label, number) {
      let severity = 'default'
      if (label === 'trace' || label === 'debug') severity = 'debug'
      if (label === 'info') severity = 'info'
      if (label === 'warn') severity = 'warning'
      if (label === 'error') severity = 'error'
      if (label === 'fatal') severity = 'critical'
      return { level: number, severity }
    }
  }
})
