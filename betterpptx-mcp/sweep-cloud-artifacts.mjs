// Private Cloud Run maintenance entry point. Run from a scheduled job with
// the artifact bucket's narrowly scoped object-list/delete identity; never
// expose this through the public MCP.
import { createArtifactStore } from './storage/artifact-store.mjs'

if (process.env.BETTERPPTX_ARTIFACT_STORE !== 'gcs'
	|| !process.env.BETTERPPTX_GCS_BUCKET) {
	throw new Error('Cloud artifact sweeping requires an explicitly configured private GCS artifact store.')
}

const store = createArtifactStore()
const removed = await store.sweepExpired()
console.log(JSON.stringify({ schemaVersion: 'betterpptx.artifact-sweep.v1', removed }))
