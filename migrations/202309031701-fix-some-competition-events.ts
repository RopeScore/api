import { Firestore } from '@google-cloud/firestore'

const firestore = new Firestore()

const oldCEvt = 'e.svgf.sp.sr.srss-vh.1.30@2023'
const newCEvt = 'e.svgf.sp.sr.srss.1.30@2023'

async function run () {
  // get all categories
  const categories = await firestore.collection('categories').where('competitionEventIds', 'array-contains', oldCEvt).get()
  await Promise.all(categories.docs.map(async dSnap => {
    const competitionEventIds = dSnap.get('competitionEventIds') as string[]
    competitionEventIds.splice(competitionEventIds.indexOf(oldCEvt), 1, newCEvt)
    return await firestore.collection('categories').doc(dSnap.id).set({
      ...dSnap.data(),
      competitionEventIds,
    })
  }))

  const entries = await firestore.collection('entries').where('competitionEventId', '==', oldCEvt).get()
  await Promise.all(entries.docs.map(async dSnap => {
    return await firestore.collection('entries').doc(dSnap.id).update({
      competitionEventId: newCEvt,
    })
  }))

  const scoresheets = await firestore.collection('scoresheets').where('competitionEventId', '==', oldCEvt).get()
  await Promise.all(scoresheets.docs.map(async dSnap => {
    return await firestore.collection('scoresheets').doc(dSnap.id).update({
      competitionEventId: newCEvt,
    })
  }))

  const judgeAssignments = await firestore.collection('judge-assignments').where('competitionEventId', '==', oldCEvt).get()
  await Promise.all(judgeAssignments.docs.map(async dSnap => {
    return await firestore.collection('judge-assignments').doc(dSnap.id).update({
      competitionEventId: newCEvt,
    })
  }))
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
