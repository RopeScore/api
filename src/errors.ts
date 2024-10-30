import { GraphQLError, type GraphQLErrorOptions } from 'graphql'

export class PublicError extends GraphQLError {}

export class NotFoundError extends PublicError {
  constructor (errOrMsg: string | Error, options?: GraphQLErrorOptions) {
    super(errOrMsg instanceof Error ? errOrMsg.message : errOrMsg, {
      ...options,
      extensions: {
        ...(options?.extensions ?? {}),
        code: 'NOT_FOUND',
      },
    })
  }
}

export class ValidationError extends PublicError {
  constructor (errOrMsg: string | Error, options?: GraphQLErrorOptions) {
    super(errOrMsg instanceof Error ? errOrMsg.message : errOrMsg, {
      ...options,
      extensions: {
        ...(options?.extensions ?? {}),
        code: 'VALIDATION_FAILED',
      },
    })
  }
}

export class InternalServerError extends PublicError {
  constructor (errOrMsg: string | Error, options?: GraphQLErrorOptions) {
    super(errOrMsg instanceof Error ? errOrMsg.message : errOrMsg, {
      ...options,
      extensions: {
        ...(options?.extensions ?? {}),
        code: 'INTERNAL_SERVER_ERROR',
      },
    })
  }
}

export class AuthenticationError extends PublicError {
  constructor (errOrMsg: string | Error, options?: GraphQLErrorOptions) {
    super(errOrMsg instanceof Error ? errOrMsg.message : errOrMsg, {
      ...options,
      extensions: {
        ...(options?.extensions ?? {}),
        code: 'UNAUTHENTICATED',
      },
    })
  }
}
export class AuthorizationError extends PublicError {
  constructor (errOrMsg: string | Error, options?: GraphQLErrorOptions) {
    super(errOrMsg instanceof Error ? errOrMsg.message : errOrMsg, {
      ...options,
      extensions: {
        ...(options?.extensions ?? {}),
        code: 'UNAUTHORIZED',
      },
    })
  }
}
