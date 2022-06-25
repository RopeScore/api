import { AuthenticationError } from 'apollo-server-express'
import { CategoryDoc, EntryDoc, isDevice, isMarkScoresheet as _isMarkScoresheet, isTallyScoresheet as _isTallyScoresheet, isUser, JudgeDoc } from '../store/schema'
import type { DeviceDoc, GroupDoc, ScoresheetDoc, UserDoc } from '../store/schema'
import type { Logger } from 'pino'
import { randomUUID } from 'node:crypto'

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

  function combineAnd (...checkMethods: Array<() => boolean>) {
    function combined () { return checkMethods.every(m => m()) }
    const annotations = {
      assert: (message?: string) => {
        const l = logger.child({ assertionChainId: randomUUID() })
        for (const checkMethod of checkMethods) {
          l.trace({ user: user?.id, assertion: checkMethod.name }, 'Trying Assertion')
          if (!checkMethod()) {
            l.info({ user: user?.id, assertion: checkMethod.name }, `Assertion failed failed ${message ? `message: ${message}` : ''}`)
            throw new AuthenticationError(`Permission denied ${message ? ': ' + message : ''}`)
          }
        }
        return true
      }
    }
    return Object.assign(combined, annotations)
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
      const isGroupAdmin = enrich(function isGroupAdmin () { return !!group && !!user && group.admins.includes(user?.id) })
      const isGroupViewer = enrich(function isGroupViewer () { return !!user && !!group && group.viewers.includes(user?.id) })
      // const isGroupDevice = enrich(function isGroupDevice () { return !!user && !!group && group.devices.includes(user?.id) })
      const isGroupUncompleted = enrich(function isGroupUncompleted () { return !!group && !group.completedAt })

      const isGroupAdminOrViewer = enrich(function isGroupAdminOrViewer () { return isGroupAdmin() || isGroupViewer() })
      const isGroupAdminOrViewerOrDevice = enrich(function isGroupAdminOrViewerOrDevice () { return isGroupAdmin() || isGroupViewer() || isGroupDevice() })

      return {
        get: isGroupAdminOrViewerOrDevice,
        update: combineAnd(isGroupAdmin, isGroupUncompleted),

        getUsers: isGroupAdminOrViewer,

        category (category?: CategoryDoc) {
          const isCategoryInGroup = enrich(function isCategoryInGroup () { return !!category && !!group && category.groupId === group.id })

          return {
            get: combineAnd(isGroupAdminOrViewerOrDevice, isCategoryInGroup, isCategoryInGroup),
            create: combineAnd(isGroupAdmin, isGroupUncompleted),
            update: combineAnd(isGroupAdmin, isGroupUncompleted, isCategoryInGroup),
            delete: combineAnd(isGroupAdmin, isGroupUncompleted, isCategoryInGroup),

            judge (judge?: JudgeDoc) {
              const isJudgeInGroup = enrich(function isJudgeInGroup () { return !!judge && !!group && judge.groupId === group.id })

              return {
                assign: combineAnd(isGroupAdmin, isGroupUncompleted, isCategoryInGroup, isJudgeInGroup)
              }
            },

            entry (entry?: EntryDoc) {
              const isEntryInCategory = enrich(function isEntryInCategory () { return !!category && !!entry && entry.categoryId === category.id })
              const isEntryUnlocked = enrich(function isEntryUnlocked () { return !!entry && entry.lockedAt == null })

              return {
                get: combineAnd(isGroupAdminOrViewerOrDevice, isCategoryInGroup, isEntryInCategory),
                create: combineAnd(isGroupAdmin, isGroupUncompleted, isCategoryInGroup),
                update: combineAnd(isGroupAdmin, isGroupUncompleted, isCategoryInGroup, isEntryInCategory, isEntryUnlocked),

                toggleLock: combineAnd(isGroupAdmin, isGroupUncompleted, isCategoryInGroup, isEntryInCategory),

                scoresheet (scoresheet?: ScoresheetDoc) {
                  const isScoresheetInEntry = enrich(function isScoresheetInEntry () { return !!entry && !!scoresheet && scoresheet.entryId === entry.id })
                  const isMarkScoresheet = enrich(function isMarkScoresheet () { return _isMarkScoresheet(scoresheet) })
                  const isTallyScoresheet = enrich(function isTallyScoresheet () { return _isTallyScoresheet(scoresheet) })
                  const isScoresheetUnsubmitted = enrich(function isUnsubmitted () { return _isMarkScoresheet(scoresheet) && !scoresheet.submittedAt })

                  return {
                    get: combineAnd(isGroupAdminOrJudge, isCategoryInGroup, isEntryInCategory, isScoresheetInEntry),
                    create: combineAnd(isGroupAdminOrJudge, isCategoryInGroup, isEntryInCategory, isScoresheetInEntry, isGroupUncompleted, isEntryUnlocked),

                    fillMark: combineAnd(isScoresheetJudge, isMarkScoresheet, isCategoryInGroup, isEntryInCategory, isScoresheetInEntry, isGroupUncompleted, isEntryUnlocked, isScoresheetUnsubmitted),
                    fillTally: combineAnd(isGroupAdmin, isTallyScoresheet, isCategoryInGroup, isEntryInCategory, isScoresheetInEntry, isGroupUncompleted, isEntryUnlocked, isScoresheetUnsubmitted)
                  }
                }
              }
            }
          }
        }

        // entry (entry?: EntryDoc) {
        //   return {
        //     // TODO: could read entry from other group?
        //     create: isGroupAdminOrViewerOrDevice,
        //     edit: isGroupAdminOrViewerOrDevice,

        //     addScoresheets: combineAnd(isGroupAdmin, isUncompleted),

        //     scoresheet (scoresheet?: ScoresheetDoc) {
        //       const isScoresheetDevice = enrich(function isScoresheetDevice () { return !!scoresheet && isDevice(user) && scoresheet.deviceId === user.id })
        //       const isUnsubmitted = enrich(function isUnsubmitted () { return !!scoresheet && !scoresheet.submittedAt })

        //       const isGroupAdminOrViewerOrScoresheetDevice = enrich(function isGroupAdminOrViewerOrScoresheetDevice () { return isGroupAdminOrViewer() || isScoresheetDevice() })

        //       return {
        //         get: isGroupAdminOrViewerOrScoresheetDevice,
        //         create: combineAnd(isGroupAdmin, isUncompleted),
        //         edit: combineAnd(isGroupAdmin, isUncompleted, isUnsubmitted),
        //         fill: combineAnd(isScoresheetDevice, isUnsubmitted)
        //       }
        //     }
        //   }
        // }
      }
    }
  }
}
