import { AuthenticationError } from 'apollo-server'
import { isDevice } from '../store/schema'
import type { DeviceDoc, GroupDoc, ScoresheetDoc, UserDoc } from '../store/schema'
import type { Logger } from 'pino'

interface AllowUserContext { logger: Logger }

export function allowUser (user: UserDoc | DeviceDoc | undefined, { logger }: AllowUserContext) {
  function enrich (checkMethod: () => boolean) {
    const annotations = {
      assert: (message?: string) => {
        logger.trace({ user: user?.id, assertion: checkMethod.name }, 'Trying Assertion')
        if (!checkMethod()) {
          logger.info({ user: user?.id, assertion: checkMethod.name }, `Assertion failed failed ${message ? `message: ${message}` : ''}`)
          throw new AuthenticationError(`Permission denied ${message ? ': ' + message : ''}`)
        }
        return true
      }
    }
    return Object.assign(checkMethod, annotations)
  }

  const isAuthenticated = enrich(() => Boolean(user))

  return {
    getGroups: isAuthenticated,

    createUser: enrich(() => !user),
    createGroup: isAuthenticated,

    getScoresheets: enrich(() => isDevice(user)),

    scoresheet (scoresheet: ScoresheetDoc) {
      const isScoresheetDevice = enrich(() => isDevice(user) && scoresheet.deviceId === user.id)
      // TODO: also if part of the owning group
      return {
        get: isScoresheetDevice,
        submit: isScoresheetDevice
      }
    },

    group (group?: GroupDoc) {
      const isGroupAdmin = enrich(() => !!group && group.admin === user?.id)
      const isGroupAdminOrViewer = enrich(() =>
        (!!group && group.admin === user?.id) ||
        (!!user && !!group && group.viewers.includes(user?.id))
      )
      return {
        get: isGroupAdminOrViewer,

        getViewers: isGroupAdminOrViewer,
        addViewers: isGroupAdmin,
        removeViewers: isGroupAdmin,

        getDevices: isGroupAdminOrViewer,
        addDevices: isGroupAdmin,

        getScoresheets: isGroupAdminOrViewer,
        createScoresheets: isGroupAdmin
      }
    }
  }
}
