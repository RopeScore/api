import pino from 'pino'

export const logger = pino({ name: 'ropescore-app', level: 'trace' })
