import { createHash } from 'node:crypto'

// oidc-provider storage adapter on Firestore: one collection per model
// (`<prefix>_<Model>`), document id = SHA-256 of the provider id (provider ids
// are opaque but not guaranteed to be valid Firestore ids). Expired documents
// are ignored on read and removed by a Firestore TTL policy on `expiresAt`.
// Payloads are stored as JSON text so their shape is never reinterpreted.
const docId = id => createHash('sha256').update(String(id)).digest('hex')

let defaultFirestore = null
function loadDefaultFirestore() {
	defaultFirestore ||= import('@google-cloud/firestore').then(({ Firestore }) => new Firestore({
		projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
		databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined,
		ignoreUndefinedProperties: true,
	}))
	return defaultFirestore
}

export function createFirestoreOAuthAdapter({ prefix = 'betterpptx_oauth', firestore, now = Date.now } = {}) {
	if (!/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(prefix)) throw new Error('Invalid OAuth store prefix.')
	const db = () => (firestore ? Promise.resolve(firestore) : loadDefaultFirestore())
	return class FirestoreOAuthAdapter {
		constructor(name) {
			this.collectionName = `${prefix}_${name}`
		}

		async collection() {
			return (await db()).collection(this.collectionName)
		}

		async upsert(id, payload, expiresIn) {
			const record = { payload: JSON.stringify(payload) }
			if (expiresIn) record.expiresAt = new Date(now() + expiresIn * 1000)
			if (payload.grantId) record.grantId = payload.grantId
			if (payload.uid) record.uid = payload.uid
			if (payload.userCode) record.userCode = payload.userCode
			await (await this.collection()).doc(docId(id)).set(record)
		}

		static live(snapshot, at) {
			if (!snapshot?.exists) return undefined
			const record = snapshot.data()
			const expiresAt = record.expiresAt?.toDate ? record.expiresAt.toDate() : record.expiresAt
			if (expiresAt && expiresAt.getTime() <= at) return undefined
			return JSON.parse(record.payload)
		}

		async find(id) {
			return FirestoreOAuthAdapter.live(await (await this.collection()).doc(docId(id)).get(), now())
		}

		async findByField(field, value) {
			const result = await (await this.collection()).where(field, '==', value).limit(1).get()
			return FirestoreOAuthAdapter.live(result.docs[0], now())
		}

		findByUid(uid) {
			return this.findByField('uid', uid)
		}

		findByUserCode(userCode) {
			return this.findByField('userCode', userCode)
		}

		async consume(id) {
			const ref = (await this.collection()).doc(docId(id))
			// A transaction makes single use atomic across gateway instances.
			await (await db()).runTransaction(async transaction => {
				const snapshot = await transaction.get(ref)
				if (!snapshot.exists) return
				const payload = JSON.parse(snapshot.data().payload)
				payload.consumed = Math.floor(now() / 1000)
				transaction.update(ref, { payload: JSON.stringify(payload) })
			})
		}

		async destroy(id) {
			await (await this.collection()).doc(docId(id)).delete()
		}

		async revokeByGrantId(grantId) {
			const result = await (await this.collection()).where('grantId', '==', grantId).get()
			if (result.empty) return
			const batch = (await db()).batch()
			for (const doc of result.docs) batch.delete(doc.ref)
			await batch.commit()
		}
	}
}
