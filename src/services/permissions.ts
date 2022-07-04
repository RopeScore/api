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
    updateUser: isAuthenticatedUser,
    updateStatus: isAuthenticatedDevice,

    getGroups: isAuthenticated,

    group (group: GroupDoc | undefined, judge: JudgeDoc | undefined) {
      const isGroupAdmin = enrich(function isGroupAdmin () { return !!group && !!user && (group.admins.includes(user?.id) || (isUser(user) && !!user.globalAdmin)) })
      const isGroupViewer = enrich(function isGroupViewer () { return !!user && !!group && group.viewers.includes(user?.id) })
      const isGroupJudge = enrich(function isGroupDevice () { return !!user && !!group && judge?.groupId === group.id })
      const isGroupUncompleted = enrich(function isGroupUncompleted () { return !!group && !group.completedAt })

      const isGroupAdminOrViewer = enrich(function isGroupAdminOrViewer () { return isGroupAdmin() || isGroupViewer() })
      const isGroupAdminOrJudge = enrich(function isGroupAdminOrViewerOrDevice () { return isGroupAdmin() || isGroupJudge() })
      const isGroupAdminOrViewerOrJudge = enrich(function isGroupAdminOrViewerOrDevice () { return isGroupAdmin() || isGroupViewer() || isGroupJudge() })

      return {
        get: isGroupAdminOrViewerOrJudge,
        create: isAuthenticatedUser,
        update: combineAnd(isGroupAdmin, isGroupUncompleted),
        toggleComplete: isGroupAdmin,

        getUsers: isGroupAdminOrViewer,

        category (category: CategoryDoc | undefined) {
          const isCategoryInGroup = enrich(function isCategoryInGroup () { return !!category && !!group && category.groupId === group.id })

          return {
            get: combineAnd(isGroupAdminOrViewerOrJudge, isCategoryInGroup, isCategoryInGroup),
            create: combineAnd(isGroupAdmin, isGroupUncompleted),
            update: combineAnd(isGroupAdmin, isGroupUncompleted, isCategoryInGroup),
            delete: combineAnd(isGroupAdmin, isGroupUncompleted, isCategoryInGroup),

            judge (judge: JudgeDoc | undefined) {
              const isJudgeInGroup = enrich(function isJudgeInGroup () { return !!judge && !!group && judge.groupId === group.id })

              return {
                assign: combineAnd(isGroupAdmin, isGroupUncompleted, isCategoryInGroup, isJudgeInGroup)
              }
            },

            entry (entry: EntryDoc | undefined) {
              const isEntryInCategory = enrich(function isEntryInCategory () { return !!category && !!entry && entry.categoryId === category.id })
              const isEntryUnlocked = enrich(function isEntryUnlocked () { return !!entry && entry.lockedAt == null })

              return {
                get: combineAnd(isGroupAdminOrViewerOrJudge, isCategoryInGroup, isEntryInCategory),
                create: combineAnd(isGroupAdmin, isGroupUncompleted, isCategoryInGroup),
                update: combineAnd(isGroupAdmin, isGroupUncompleted, isCategoryInGroup, isEntryInCategory, isEntryUnlocked),

                toggleLock: combineAnd(isGroupAdmin, isGroupUncompleted, isCategoryInGroup, isEntryInCategory),

                scoresheet (scoresheet: ScoresheetDoc | undefined) {
                  const isScoresheetInEntry = enrich(function isScoresheetInEntry () { return !!entry && !!scoresheet && scoresheet.entryId === entry.id })
                  const isMarkScoresheet = enrich(function isMarkScoresheet () { return _isMarkScoresheet(scoresheet) })
                  const isTallyScoresheet = enrich(function isTallyScoresheet () { return _isTallyScoresheet(scoresheet) })
                  const isScoresheetUnsubmitted = enrich(function isUnsubmitted () { return _isMarkScoresheet(scoresheet) && !scoresheet.submittedAt })
                  const isScoresheetDevice = enrich(function isScoresheetDevice () { return _isMarkScoresheet(scoresheet) && !!user && scoresheet.deviceId === user.id })

                  const isGroupAdminOrScoresheetDevice = enrich(function isGroupAdminOrScoresheetDevice () { return isGroupAdmin() || isScoresheetDevice() })

                  return {
                    get: combineAnd(isGroupAdminOrScoresheetDevice, isCategoryInGroup, isEntryInCategory, isScoresheetInEntry),
                    create: combineAnd(isGroupAdminOrJudge, isCategoryInGroup, isEntryInCategory, isGroupUncompleted, isEntryUnlocked),

                    fillMark: combineAnd(isScoresheetDevice, isMarkScoresheet, isCategoryInGroup, isEntryInCategory, isScoresheetInEntry, isGroupUncompleted, isEntryUnlocked, isScoresheetUnsubmitted),
                    fillTally: combineAnd(isGroupAdmin, isTallyScoresheet, isCategoryInGroup, isEntryInCategory, isScoresheetInEntry, isGroupUncompleted, isEntryUnlocked)
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
