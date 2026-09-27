import { renderMuseTalkHttp } from './musetalkHttp.mjs'

export async function renderLivePortraitMuseTalkHttp(args = {}) {
	return renderMuseTalkHttp({ ...args, provider: 'liveportrait-musetalk' })
}
