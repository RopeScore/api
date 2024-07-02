import { Firestore } from '@google-cloud/firestore'
import pLimit from 'p-limit'

const firestore = new Firestore()

const newCevtMap: Record<string, undefined | Record<string, undefined | string>> = {
  'svgf-rh@2020': {
    'e.ijru.fs.sr.srif.1.75': 'e.svgf.fs.sr.srif-rh.1.75@2020',
    'e.ijru.fs.sr.srpf.2.75': 'e.svgf.fs.sr.srpf-rh.2.75@2020',
    'e.ijru.fs.sr.srtf.4.75': 'e.svgf.fs.sr.srtf-rh.4.75@2020',
    'e.ijru.fs.dd.ddsf.3.75': 'e.svgf.fs.dd.ddsf-rh.3.75@2020',
    'e.ijru.fs.dd.ddpf.4.75': 'e.svgf.fs.dd.ddpf-rh.4.75@2020'
  },
  'svgf-vh@2023': {
    'e.ijru.sp.sr.srss.1.30': 'e.svgf.sp.sr.srss.1.30@2023',
    'e.ijru.sp.sr.srsr.4.4x30': 'e.svgf.sp.sr.srsr.4.4x30@2023',
    'e.ijru.fs.sr.srif.1.75': 'e.svgf.fs.sr.srif-vh.1.75@2023',
    'e.ijru.fs.sr.srtf.4.75': 'e.svgf.fs.sr.srtf-vh.4.75@2023',
    'e.svgf.fs.dd.ddpf.4.120': 'e.svgf.fs.dd.ddpf-vh.4.120@2023'
  }
}

function getNewCEvt (rulesId: string, cEvt: string) {
  if (cEvt.includes('@')) return cEvt
  const ruleVersion = rulesId.split('@')[1]
  if (newCevtMap[rulesId]?.[cEvt] != null) return newCevtMap[rulesId]?.[cEvt]
  if (cEvt.startsWith('e.ijru.sp')) return `${cEvt}@1.0.0`
  return `${cEvt}@${ruleVersion}`
}

async function getScoresheetsByEntryIds (entryIds: string[]) {
  const promises = []
  const chunkSize = 10
  for (let idx = 0; idx < entryIds.length; idx += 10) {
    const entryIdsChunk = entryIds.slice(idx, idx + chunkSize)
    promises.push(firestore.collection('scoresheets').where('entryId', 'in', entryIdsChunk).get().then(qSnap => qSnap.docs))
  }

  return (await Promise.all(promises)).flat()
}

async function run () {
  // get all categories
  const categories = await firestore.collection('categories').get()
  for (const category of categories.docs) {
    const rulesId = category.get('rulesId') as string

    const entryLimit = pLimit(100)
    const entries = await firestore.collection('entries').where('categoryId', '==', category.id).get()
    await Promise.all(entries.docs.map(async dSnap => entryLimit(async () => {
      const oldId = dSnap.get('competitionEventId') as string
      if (typeof oldId === 'string' && oldId.includes('@')) return
      return firestore.collection('entries').doc(dSnap.id).update({
        competitionEventId: getNewCEvt(rulesId, oldId)
      })
    })))

    const scshLimit = pLimit(100)
    const scoresheets = await getScoresheetsByEntryIds(entries.docs.map(dSnap => dSnap.id))
    await Promise.all(scoresheets.map(async dSnap => scshLimit(async () => {
      const oldId = dSnap.get('competitionEventId') as string
      if (typeof oldId === 'string' && oldId.includes('@')) return
      return firestore.collection('scoresheets').doc(dSnap.id).update({
        competitionEventId: getNewCEvt(rulesId, oldId)
      })
    })))

    const jALimit = pLimit(100)
    const judgeAssignments = await firestore.collection('judge-assignments').where('categoryId', '==', category.id).get()
    await Promise.all(judgeAssignments.docs.map(async dSnap => jALimit(async () => {
      const oldId = dSnap.get('competitionEventId') as string
      if (typeof oldId === 'string' && oldId.includes('@')) return
      return firestore.collection('judge-assignments').doc(dSnap.id).update({
        competitionEventId: getNewCEvt(rulesId, oldId)
      })
    })))

    await firestore.collection('categories').doc(category.id).set({
      ...category.data(),
      competitionEventIds: (category.get('competitionEventIds') as string[]).map(cEvt => getNewCEvt(rulesId, cEvt)),
      ...(category.get('pagePrintConfig') != null
        ? {
            pagePrintConfig: Object.fromEntries(Object.entries(category.get('pagePrintConfig') as Record<string, unknown>).map(([cEvt, v]) => [getNewCEvt(rulesId, cEvt), v]))
          }
        : {})
    })
  }
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
