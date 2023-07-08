import pino from 'pino'
import { LOG_LEVEL } from '../config'

export const logger = pino({
  name: '@ropescore/api',
  level: LOG_LEVEL,
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
