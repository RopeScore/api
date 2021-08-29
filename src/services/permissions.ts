import { AuthenticationError } from 'apollo-server'
import { EntryDoc, isDevice, isUser } from '../store/schema'
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

  const isUnauthenticated = enrich(function isUnauthenticated () { return !user })
  const isAuthenticated = enrich(function isAuthenticated () { return Boolean(user) })
  const isAuthenticatedUser = enrich(function isAuthenticatedUser () { return isUser(user) })
  const isAuthenticatedDevice = enrich(function isAuthenticatedDevice () { return isDevice(user) })

  return {
    register: isUnauthenticated,
    updateStatus: isAuthenticatedDevice,

    getGroups: isAuthenticated,
    createGroup: isAuthenticatedUser,

    group (group?: GroupDoc) {
      const isGroupAdmin = enrich(function isGroupAdmin () { return !!group && group.admin === user?.id })
      const isGroupViewer = enrich(function isGroupViewer () { return !!user && !!group && group.viewers.includes(user?.id) })
      const isGroupDevice = enrich(function isGroupDevice () { return !!user && !!group && group.devices.includes(user?.id) })
      const isUncompleted = enrich(function isUncompleted () { return !!group && !group.completedAt })

      const isGroupAdminOrViewer = enrich(function isGroupAdminOrViewer () { return isGroupAdmin() || isGroupViewer() })
      const isGroupAdminOrViewerOrDevice = enrich(function isGroupAdminOrViewerOrDevice () { return isGroupAdmin() || isGroupViewer() || isGroupDevice() })
      const isGroupAdminAndUncompleted = enrich(function isGroupAdminAndUncompleted () { return isGroupAdmin() && isUncompleted() })

      return {
        get: isGroupAdminOrViewerOrDevice,
        complete: isGroupAdminAndUncompleted,

        getViewers: isGroupAdminOrViewer,
        addViewers: isGroupAdminAndUncompleted,
        removeViewers: isGroupAdminAndUncompleted,

        getDevices: isGroupAdminOrViewer,
        addDevices: isGroupAdminAndUncompleted,
        removeDevices: isGroupAdminAndUncompleted,

        getEntries: isGroupAdminOrViewerOrDevice,
        addEntries: isGroupAdminAndUncompleted,

        entry (entry?: EntryDoc) {
          return {
            // TODO: could read entry from other group?
            get: isGroupAdminOrViewerOrDevice,
            create: isGroupAdminOrViewerOrDevice,
            edit: isGroupAdminOrViewerOrDevice,

            addScoresheets: isGroupAdminAndUncompleted,

            scoresheet (scoresheet?: ScoresheetDoc) {
              const isScoresheetDevice = enrich(function isScoresheetDevice () { return !!scoresheet && isDevice(user) && scoresheet.deviceId === user.id })
              const isSubmitted = enrich(function isSubmitted () { return !!scoresheet && !!scoresheet.submittedAt })

              const isScoresheetDeviceAndUnsubmitted = enrich(function isScoresheetDeviceAndUnsubmitted () { return isScoresheetDevice() && !isSubmitted() })
              const isGroupAdminOrViewerOrScoresheetDevice = enrich(function isGroupAdminOrViewerOrScoresheetDevice () { return isGroupAdminOrViewer() || isScoresheetDevice() })
              const isGroupAdminAndUncompletedAndUnsubmitted = enrich(function isGroupAdminAndUncompletedAndUnsubmitted () { return isGroupAdminAndUncompleted() && !isSubmitted() })
              return {
                get: isGroupAdminOrViewerOrScoresheetDevice,
                create: isGroupAdminAndUncompleted,
                edit: isGroupAdminAndUncompletedAndUnsubmitted,
                fill: isScoresheetDeviceAndUnsubmitted
              }
            }
          }
        }
      }
    }
  }
}
