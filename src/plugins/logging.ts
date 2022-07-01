import { ApolloError } from 'apollo-server-express'
import type { ApolloServerPlugin } from 'apollo-server-plugin-base'
import type { ApolloContext } from '../apollo'

const sentryPlugin: ApolloServerPlugin<ApolloContext> = {
  async requestDidStart (_) {
    return {
      async didResolveOperation ({ operationName, context }) {
        context.logger.trace({ operationName }, 'resolved operation')
      },
      async didEncounterErrors ({ operation, errors, context }) {
        // If we couldn't parse the operation, don't
        // do anything here
        if (!operation) {
          return
        }

        for (const err of errors) {
          // Only report internal server errors,
          // all errors extending ApolloError should be user-facing
          if (err instanceof ApolloError) {
            continue
          }

          context.logger.error(err)
        }
      }
    }
  }
}

export default sentryPlugin
