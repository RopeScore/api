import { AuthenticationError } from 'apollo-server'
import { isDevice, isUser } from '../store/schema'
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

  const isUnauthenticated = enrich(() => !user)
  const isAuthenticated = enrich(() => Boolean(user))
  const isAuthenticatedUser = enrich(() => isUser(user))

  return {
    register: isUnauthenticated,

    getGroups: isAuthenticated,
    createGroup: isAuthenticatedUser,

    group (group?: GroupDoc) {
      const isGroupAdmin = enrich(() => !!group && group.admin === user?.id)
      const isGroupViewer = enrich(() => !!user && !!group && group.viewers.includes(user?.id))
      const isGroupDevice = enrich(() => !!user && !!group && group.devices.includes(user?.id))
      const isUncompleted = enrich(() => !!group && !group.completedAt)

      const isGroupAdminOrViewer = enrich(() => isGroupAdmin() || isGroupViewer())
      const isGroupAdminOrViewerOrDevice = enrich(() => isGroupAdmin() || isGroupViewer() || isGroupDevice())
      const isGroupAdminAndUncompleted = enrich(() => isGroupAdmin() && isUncompleted())

      return {
        get: isGroupAdminOrViewerOrDevice,
        complete: isGroupAdminAndUncompleted,

        getViewers: isGroupAdminOrViewer,
        addViewers: isGroupAdminAndUncompleted,
        removeViewers: isGroupAdminAndUncompleted,

        getDevices: isGroupAdminOrViewer,
        addDevices: isGroupAdminAndUncompleted,
        removeDevices: isGroupAdminAndUncompleted,

        getScoresheets: isGroupAdminOrViewerOrDevice,

        scoresheet (scoresheet?: ScoresheetDoc) {
          const isScoresheetDevice = enrich(() => !!scoresheet && isDevice(user) && scoresheet.deviceId === user.id)
          const isSubmitted = enrich(() => !!scoresheet && !!scoresheet.submittedAt)

          const isScoresheetDeviceAndUnsubmitted = enrich(() => isScoresheetDevice() && !isSubmitted())
          return {
            get: enrich(() => isGroupAdminOrViewer() || isScoresheetDevice()),
            create: isGroupAdminAndUncompleted(),
            edit: enrich(() => isGroupAdminAndUncompleted() && !isSubmitted()),
            fill: isScoresheetDeviceAndUnsubmitted
          }
        }
      }
    }
  }
}
