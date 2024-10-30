import type { ApolloServerPlugin } from '@apollo/server'
import type { ApolloContext } from '../apollo'
import { PublicError } from '../errors'

const sentryPlugin: ApolloServerPlugin<ApolloContext> = {
  async requestDidStart (_) {
    return {
      async didResolveOperation ({ operationName, contextValue }) {
        contextValue.logger.trace({ operationName }, 'resolved operation')
      },
      async didEncounterErrors ({ operation, errors, contextValue }) {
        // If we couldn't parse the operation, don't
        // do anything here
        if (!operation) {
          return
        }

        for (const err of errors) {
          // Only report internal server errors,
          // all errors extending PublicError should be user-facing
          if (err instanceof PublicError) {
            continue
          }

          contextValue.logger.error(err)
        }
      },
    }
  },
}

export default sentryPlugin
