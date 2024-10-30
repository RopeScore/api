import { Ttl } from '../config'
import { type Resolvers } from '../generated/graphql'
import { type AthleteDoc, isAthlete, isTeam, type TeamDoc } from '../store/schema'
import { NotFoundError, ValidationError } from '../errors'
import type { LibraryFields } from 'apollo-datasource-firestore/dist/helpers'

export const participantResolvers: Resolvers = {
  Mutation: {
    async createAthlete (_, { categoryId, data }, { allowUser, dataSources, user }) {
      const category = await dataSources.categories.findOneById(categoryId)
      if (!category) throw new NotFoundError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new NotFoundError('Group does not exist')
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, judge).category(category).update.assert()

      const athlete = await dataSources.participants.createOne({
        categoryId,
        type: 'athlete',
        name: data.name,
        club: data.club ?? undefined,
        country: data.country ?? undefined,
        ijruId: data.ijruId ?? undefined,
      } as Omit<AthleteDoc, keyof LibraryFields>)

      return athlete as AthleteDoc
    },
    async createTeam (_, { categoryId, data }, { allowUser, dataSources, user }) {
      const category = await dataSources.categories.findOneById(categoryId)
      if (!category) throw new NotFoundError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new NotFoundError('Group does not exist')
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, judge).category(category).update.assert()

      const team = await dataSources.participants.createOne({
        categoryId,
        type: 'team',
        name: data.name,
        club: data.club ?? undefined,
        country: data.country ?? undefined,
        members: data.members ?? [],
      } as Omit<TeamDoc, keyof LibraryFields>)

      return team as TeamDoc
    },

    async updateAthlete (_, { participantId, data }, { dataSources, allowUser, user }) {
      const participant = await dataSources.participants.findOneById(participantId)
      if (!participant) throw new NotFoundError('Participant does not exist')
      const category = await dataSources.categories.findOneById(participant.categoryId)
      if (!category) throw new NotFoundError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new NotFoundError('Group does not exist')
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, judge).category(category).update.assert()

      if (!isAthlete(participant)) throw new ValidationError('Participant is not an athlete')

      const updates: Partial<AthleteDoc> = {}

      if (data.name) updates.name = data.name
      if (data.club) updates.club = data.club
      if (data.country) updates.country = data.country
      if (data.ijruId) updates.ijruId = data.ijruId

      return await dataSources.participants.updateOnePartial(participant.id, updates) as AthleteDoc
    },
    async updateTeam (_, { participantId, data }, { dataSources, allowUser, user }) {
      const participant = await dataSources.participants.findOneById(participantId)
      if (!participant) throw new NotFoundError('Participant does not exist')
      const category = await dataSources.categories.findOneById(participant.categoryId)
      if (!category) throw new NotFoundError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new NotFoundError('Group does not exist')
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, judge).category(category).update.assert()

      if (!isTeam(participant)) throw new ValidationError('Participant is not a team')

      const updates: Partial<TeamDoc> = {}

      if (data.name) updates.name = data.name
      if (data.club) updates.club = data.club
      if (data.country) updates.country = data.country
      if (Array.isArray(data.members)) updates.members = data.members

      return await dataSources.participants.updateOnePartial(participant.id, updates) as TeamDoc
    },

    async deleteParticipant (_, { participantId }, { dataSources, allowUser, user }) {
      const participant = await dataSources.participants.findOneById(participantId)
      if (!participant) throw new NotFoundError('Participant does not exist')
      const category = await dataSources.categories.findOneById(participant.categoryId)
      if (!category) throw new NotFoundError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId)
      if (!group) throw new NotFoundError('Group does not exist')
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id })
      allowUser.group(group, judge).category(category).update.assert()

      await dataSources.entries.deleteManyByParticipant(participant.id)
      await dataSources.participants.deleteOne(participant.id)

      return participant
    },
  },
  Athlete: {
    async category (athlete, args, { dataSources, allowUser, user }) {
      const category = await dataSources.categories.findOneById(athlete.categoryId, { ttl: Ttl.Short })
      if (!category) throw new NotFoundError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      if (!group) throw new NotFoundError('Group does not exist')
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).get.assert()

      return category
    },
  },
  Team: {
    async category (athlete, args, { dataSources, allowUser, user }) {
      const category = await dataSources.categories.findOneById(athlete.categoryId, { ttl: Ttl.Short })
      if (!category) throw new NotFoundError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      if (!group) throw new NotFoundError('Group does not exist')
      const judge = await dataSources.judges.findOneByActor({ actor: user, groupId: group.id }, { ttl: Ttl.Short })
      allowUser.group(group, judge).category(category).get.assert()

      return category
    },
  },
}
