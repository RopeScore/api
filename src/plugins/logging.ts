import { ApolloError } from 'apollo-server'
import type { ApolloServerPlugin } from 'apollo-server-plugin-base'

const sentryPlugin: ApolloServerPlugin = {
  requestDidStart (_) {
    return {
      async willSendResponse () {
      },
      didResolveOperation ({ request, document, operationName, context }) {
        context.logger.trace({ operationName }, 'resolved operation')
      },
      didEncounterErrors (ctx) {
        // If we couldn't parse the operation, don't
        // do anything here
        if (!ctx.operation) {
          return
        }

        for (const err of ctx.errors) {
          // Only report internal server errors,
          // all errors extending ApolloError should be user-facing
          if (err instanceof ApolloError) {
            continue
          }

          const { message, ...rest } = err

          ctx.context.logger.error(rest, err.message)
        }
      }
    }
  }
}

export default sentryPlugin
