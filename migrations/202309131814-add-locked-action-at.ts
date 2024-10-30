import { Firestore } from '@google-cloud/firestore'

const firestore = new Firestore()

async function run () {
  const entries = await firestore.collection('entries').where('lockedAt', '!=', null).get()
  await Promise.all(entries.docs.map(async dSnap => {
    return await firestore.collection('entries').doc(dSnap.id).update({
      lockActionAt: dSnap.get('lockedAt'),
    })
  }))
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
