import { ApolloError } from 'apollo-server-core'
import { Ttl } from '../config'
import { Resolvers } from '../generated/graphql'
import { AthleteDoc, isAthlete, isTeam, TeamDoc } from '../store/schema'

export const participantResolvers: Resolvers = {
  Mutation: {
    async createAthlete (_, { categoryId, data }, { allowUser, dataSources }) {
      const category = await dataSources.categories.findOneById(categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).update.assert()

      await dataSources.participants.createOne({
        categoryId,
        type: 'athlete',
        name: data.name,
        club: data.club ?? undefined,
        country: data.country ?? undefined,
        ijruId: data.ijruId ?? undefined
      })

      return category
    },
    async createTeam (_, { categoryId, data }, { allowUser, dataSources }) {
      const category = await dataSources.categories.findOneById(categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).update.assert()

      await dataSources.participants.createOne({
        categoryId,
        type: 'team',
        name: data.name,
        club: data.club ?? undefined,
        country: data.country ?? undefined,
        members: data.members ?? []
      })

      return category
    },

    async updateAthlete (_, { participantId, data }, { dataSources, allowUser }) {
      const participant = await dataSources.participants.findOneById(participantId, { ttl: Ttl.Short })
      if (!participant) throw new ApolloError('Participant does not exist')
      const category = await dataSources.categories.findOneById(participant.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).update.assert()

      if (!isAthlete(participant)) throw new ApolloError('Participant is not an athlete')

      const updates: Partial<AthleteDoc> = {}

      if (data.name) updates.name = data.name
      if (data.club) updates.club = data.club
      if (data.country) updates.country = data.country
      if (data.ijruId) updates.ijruId = data.ijruId

      return await dataSources.participants.updateOnePartial(participant.id, updates) as AthleteDoc
    },
    async updateTeam (_, { participantId, data }, { dataSources, allowUser }) {
      const participant = await dataSources.participants.findOneById(participantId, { ttl: Ttl.Short })
      if (!participant) throw new ApolloError('Participant does not exist')
      const category = await dataSources.categories.findOneById(participant.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).update.assert()

      if (!isTeam(participant)) throw new ApolloError('Participant is not a team')

      const updates: Partial<TeamDoc> = {}

      if (data.name) updates.name = data.name
      if (data.club) updates.club = data.club
      if (data.country) updates.country = data.country
      if (Array.isArray(data.members)) updates.members = data.members

      return await dataSources.participants.updateOnePartial(participant.id, updates) as TeamDoc
    },

    async deleteParticipant (_, { participantId }, { dataSources, allowUser }) {
      const participant = await dataSources.participants.findOneById(participantId, { ttl: Ttl.Short })
      if (!participant) throw new ApolloError('Participant does not exist')
      const category = await dataSources.categories.findOneById(participant.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).update.assert()

      await dataSources.participants.deleteOne(participant.id)

      return participant
    }
  },
  Athlete: {
    async category (athlete, args, { dataSources, allowUser }) {
      const category = await dataSources.categories.findOneById(athlete.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).get.assert()

      return category
    }
  },
  Team: {
    async category (athlete, args, { dataSources, allowUser }) {
      const category = await dataSources.categories.findOneById(athlete.categoryId, { ttl: Ttl.Short })
      if (!category) throw new ApolloError('Category does not exist')
      const group = await dataSources.groups.findOneById(category.groupId, { ttl: Ttl.Short })
      allowUser.group(group).category(category).get.assert()

      return category
    }
  }
}
