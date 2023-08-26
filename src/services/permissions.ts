import { type CategoryDoc, type DeviceStreamShareDoc, DeviceStreamShareStatus, type EntryDoc, isDevice, isMarkScoresheet as _isMarkScoresheet, isTallyScoresheet as _isTallyScoresheet, isUser, type JudgeDoc, type DeviceDoc, type GroupDoc, type ScoresheetDoc, type UserDoc } from '../store/schema'
import type { Logger } from 'pino'
import { randomUUID } from 'node:crypto'
import { LRUCache } from 'lru-cache'
import { Ttl } from '../config'
import type { DataSources } from '../apollo'
import { AuthorizationError } from '../errors'

interface AllowUserContext { logger: Logger }

export function allowUser (user: UserDoc | DeviceDoc | undefined, { logger }: AllowUserContext) {
  function enrich (checkMethod: () => boolean) {
    const annotations = {
      assert: (message?: string) => {
        logger.trace({ user: user?.id, assertion: checkMethod.name }, 'Trying Assertion')
        if (!checkMethod()) {
          logger.info({ user: user?.id, assertion: checkMethod.name }, `Assertion failed failed ${message ? `message: ${message}` : ''}`)
          throw new AuthorizationError(`Permission denied ${message ? ': ' + message : ''}`)
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
            throw new AuthorizationError(`Permission denied ${message ? ': ' + message : ''}`)
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
    addDeviceMark: isAuthenticatedDevice,

    getGroups: isAuthenticated,

    deviceStreamShare (share: DeviceStreamShareDoc | undefined) {
      const isShareAccepted = enrich(function isShareAccepted () { return share?.status === DeviceStreamShareStatus.Accepted })
      const isShareUser = enrich(function isShareUser () { return !!user && !!share && user.id === share.userId })
      const isShareDevice = enrich(function isShareUser () { return !!user && !!share && user.id === share.deviceId })

      return {
        create: isAuthenticatedDevice,
        delete: combineAnd(isAuthenticatedDevice, isShareDevice),

        request: isAuthenticatedUser,
        readScores: combineAnd(isShareUser, isShareAccepted)
      }
    },

    user (innerUser?: UserDoc | undefined) {
      const isAuthUser = enrich(function isAuthUser () { return !!user && !!innerUser && user.id === innerUser.id })

      return {
        read: isAuthUser
      }
    },

    device (device?: DeviceDoc | undefined) {
      const isAuthDevice = enrich(function isAuthDevice () { return !!user && !!device && user.id === device.id })

      return {
        read: isAuthDevice
      }
    },

    group (group: GroupDoc | undefined, authJudge: JudgeDoc | undefined) {
      const isGroupAdmin = enrich(function isGroupAdmin () { return !!group && !!user && (group.admins.includes(user?.id) || (isUser(user) && !!user.globalAdmin)) })
      const isGroupViewer = enrich(function isGroupViewer () { return !!user && !!group && group.viewers.includes(user?.id) })
      const isGroupJudge = enrich(function isGroupDevice () { return !!user && !!group && authJudge?.groupId === group.id })
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

        judge (judge: JudgeDoc | undefined) {
          const isAuthedJudge = enrich(function isAuthedJudge () { return !!judge && !!authJudge && authJudge.id === judge.id })

          const isGroupAdminOrViewerOrAuthedJudge = enrich(function isGroupAdminOrViewerOrDevice () { return isGroupAdmin() || isGroupViewer() || isAuthedJudge() })
          return {
            get: isGroupAdminOrViewerOrAuthedJudge
          }
        },

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
                reorder: combineAnd(isGroupAdmin, isGroupUncompleted, isCategoryInGroup, isEntryInCategory),

                scoresheet (scoresheet: ScoresheetDoc | undefined) {
                  const isScoresheetInEntry = enrich(function isScoresheetInEntry () { return !!entry && !!scoresheet && scoresheet.entryId === entry.id })
                  const isMarkScoresheet = enrich(function isMarkScoresheet () { return _isMarkScoresheet(scoresheet) })
                  const isTallyScoresheet = enrich(function isTallyScoresheet () { return _isTallyScoresheet(scoresheet) })
                  const isScoresheetUnsubmitted = enrich(function isUnsubmitted () { return _isMarkScoresheet(scoresheet) && !scoresheet.submittedAt })
                  const isScoresheetDevice = enrich(function isScoresheetDevice () { return _isMarkScoresheet(scoresheet) && !!user && scoresheet.deviceId === user.id })

                  const isGroupAdminOrViewerOrScoresheetDevice = enrich(function isGroupAdminOrScoresheetDevice () { return isGroupAdminOrViewer() || isScoresheetDevice() })

                  return {
                    get: combineAnd(isGroupAdminOrViewerOrScoresheetDevice, isCategoryInGroup, isEntryInCategory, isScoresheetInEntry),
                    create: combineAnd(isGroupAdminOrJudge, isCategoryInGroup, isEntryInCategory, isGroupUncompleted, isEntryUnlocked),
                    updateOptions: combineAnd(isGroupAdmin, isTallyScoresheet, isCategoryInGroup, isEntryInCategory, isScoresheetInEntry, isGroupUncompleted, isEntryUnlocked),

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

export const addStreamMarkPermissionCache = new LRUCache<`${'d' | 'u'}::${UserDoc['id'] | DeviceDoc['id']}::${string}`, boolean, { dataSources: DataSources, logger: Logger }>({
  max: 1000,
  ttl: Ttl.Long * 1000,
  ttlAutopurge: false,
  // we want them deleted aka return undefined so that the next check tries
  // again. We only want to cache successes
  noDeleteOnFetchRejection: false,
  async fetchMethod (key, staleValue, { options, context: { dataSources, logger } }) {
    const [actorType, actorId, scoresheetId] = key.split('::')
    if (actorType == null || actorId == null || scoresheetId == null) throw new TypeError('Invalid key')
    logger.warn({ actorType, actorId, scoresheetId }, 'fetching addStreamMark permission')
    const actor = actorType === 'd'
      ? await dataSources.devices.findOneById(actorId, { ttl: Ttl.Short })
      : await dataSources.users.findOneById(actorId, { ttl: Ttl.Short })

    const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
    if (!scoresheet) throw new Error('Scoresheet not found')
    const entry = await dataSources.entries.findOneById(scoresheet.entryId)
    if (!entry) throw new Error('Entry not found')
    const category = await dataSources.categories.findOneById(entry.categoryId)
    if (!category) throw new Error('Category not found')
    const group = await dataSources.groups.findOneById(category.groupId)
    if (!group) throw new Error('Group not found')
    const authJudge = await dataSources.judges.findOneByActor({ actor, groupId: group.id })

    allowUser(actor, { logger }).group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).fillMark.assert()
    return true
  }
})

export const streamMarkAddedPermissionCache = new LRUCache<`${'d' | 'u'}::${UserDoc['id'] | DeviceDoc['id']}::${string}`, boolean, { dataSources: DataSources, logger: Logger }>({
  max: 1000,
  ttl: Ttl.Long * 1000,
  ttlAutopurge: false,
  // we want them deleted aka return undefined so that the next check tries
  // again. We only want to cache successes
  noDeleteOnFetchRejection: false,
  async fetchMethod (key, staleValue, { options, context: { dataSources, logger } }) {
    const [actorType, actorId, scoresheetId] = key.split('::')
    if (actorType == null || actorId == null || scoresheetId == null) throw new TypeError('Invalid key')
    logger.warn({ actorType, actorId, scoresheetId }, 'fetching streamMarkAdded permission')
    const actor = actorType === 'd'
      ? await dataSources.devices.findOneById(actorId, { ttl: Ttl.Short })
      : await dataSources.users.findOneById(actorId, { ttl: Ttl.Short })

    const scoresheet = await dataSources.scoresheets.findOneById(scoresheetId)
    if (!scoresheet) return false
    const entry = await dataSources.entries.findOneById(scoresheet.entryId)
    if (!entry) return false
    const category = await dataSources.categories.findOneById(entry.categoryId)
    if (!category) return false
    const group = await dataSources.groups.findOneById(category.groupId)
    if (!group) return false
    const authJudge = await dataSources.judges.findOneByActor({ actor, groupId: group.id })

    return allowUser(actor, { logger }).group(group, authJudge).category(category).entry(entry).scoresheet(scoresheet).get()
  }
})

export const deviceStreamMarkAddedPermissionCache = new LRUCache<`${UserDoc['id']}::${DeviceDoc['id']}`, boolean, { dataSources: DataSources, logger: Logger }>({
  max: 1000,
  ttl: Ttl.Long * 1000,
  ttlAutopurge: false,
  // we want them deleted aka return undefined so that the next check tries
  // again. We only want to cache successes
  noDeleteOnFetchRejection: false,
  async fetchMethod (key, staleValue, { options, context: { dataSources, logger } }) {
    const [userId, deviceId] = key.split('::')
    if (userId == null || deviceId == null) throw new TypeError('Invalid key')
    logger.warn({ userId, deviceId }, 'fetching deviceStreamMarkAdded permission')
    const user = await dataSources.users.findOneById(userId)

    const share = await dataSources.deviceStreamShares.findOneByDeviceUser({ deviceId, userId })

    return allowUser(user, { logger }).deviceStreamShare(share).readScores()
  }
})
