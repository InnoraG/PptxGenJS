const state = {
	events: [],
	filtered: [],
	selectedGroup: '',
	selectedIndex: -1,
	selectedConversationIndex: -1,
	viewMode: 'conversation',
	fileNames: [],
	live: {
		source: null,
		enabled: false,
		offset: 0,
		logger: null,
		reconnectTimer: null,
	},
}

const els = {
	fileInput: document.getElementById('fileInput'),
	fileMeta: document.getElementById('fileMeta'),
	liveStatus: document.getElementById('liveStatus'),
	liveButton: document.getElementById('liveButton'),
	dropZone: document.getElementById('dropZone'),
	totalCount: document.getElementById('totalCount'),
	toolCount: document.getElementById('toolCount'),
	errorCount: document.getElementById('errorCount'),
	avgDuration: document.getElementById('avgDuration'),
	sessionCount: document.getElementById('sessionCount'),
	typeFilter: document.getElementById('typeFilter'),
	textFilter: document.getElementById('textFilter'),
	groupMode: document.getElementById('groupMode'),
	errorOnly: document.getElementById('errorOnly'),
	clearButton: document.getElementById('clearButton'),
	copyButton: document.getElementById('copyButton'),
	conversationViewButton: document.getElementById('conversationViewButton'),
	timelineViewButton: document.getElementById('timelineViewButton'),
	mainPanelTitle: document.getElementById('mainPanelTitle'),
	visibleCount: document.getElementById('visibleCount'),
	timeRange: document.getElementById('timeRange'),
	conversationView: document.getElementById('conversationView'),
	timelineView: document.getElementById('timelineView'),
	conversationList: document.getElementById('conversationList'),
	groupList: document.getElementById('groupList'),
	eventRows: document.getElementById('eventRows'),
	detailPane: document.getElementById('detailPane'),
}

function readPath(obj, path) {
	return path.split('.').reduce((acc, key) => acc && acc[key], obj)
}

function firstValue(obj, paths) {
	for (const path of paths) {
		const value = readPath(obj, path)
		if (value !== undefined && value !== null && value !== '') return String(value)
	}
	return ''
}

function compactId(value) {
	if (!value) return ''
	const text = String(value)
	return text.length > 20 ? `${text.slice(0, 9)}...${text.slice(-8)}` : text
}

function eventName(event) {
	return firstValue(event, ['data.name', 'name', 'data.tool', 'data.method', 'data.result.name', 'data.clientInfo.name'])
}

function eventId(event, mode = '') {
	if (mode === 'sessionId') return firstValue(event, ['data.sessionId', 'data.headers.mcp-session-id', 'data.clientInfo.name', 'sessionId'])
	if (mode === 'pid') return String(event.pid || event.data?.pid || '')
	if (mode === 'type') return event.type || 'unknown'
	if (mode === 'callId') return firstValue(event, ['data.callId', 'callId'])
	if (mode === 'requestId') return firstValue(event, ['data.requestId', 'requestId', 'data.callId', 'callId'])
	return firstValue(event, ['data.sessionId', 'data.headers.mcp-session-id', 'data.requestId', 'requestId', 'data.callId', 'callId', 'pid'])
}

function groupKey(event, mode) {
	return eventId(event, mode) || '(none)'
}

function eventDuration(event) {
	const value = readPath(event, 'data.durationMs') ?? event.durationMs
	return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isErrorEvent(event) {
	const type = String(event.type || '').toLowerCase()
	return type.includes('error') || type.includes('throw') || Boolean(event.isError || event.data?.error || event.data?.result?.isError)
}

function parseJsonMaybe(text) {
	if (!text || typeof text !== 'string') return null
	try { return JSON.parse(text) } catch (_) { return null }
}

function responsePayload(event) {
	const response = event.data?.response
	if (!response) return null
	if (response.structuredContent) return response.structuredContent
	const text = response.content?.find?.(item => item?.type === 'text')?.text
	return parseJsonMaybe(text) || (text ? { text } : null)
}

function summarizeValue(value, max = 220) {
	if (value === null || value === undefined) return ''
	if (typeof value === 'string') return value.length > max ? `${value.slice(0, max)}...` : value
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`
	if (typeof value === 'object') {
		const priority = ['ok', 'valid', 'issueCount', 'errorCount', 'warningCount', 'slideCount', 'bytes', 'downloadName', 'deckId', 'filePath', 'downloadUrl']
		const parts = []
		for (const key of priority) {
			if (value[key] !== undefined) parts.push(`${key}=${summarizeValue(value[key], 80)}`)
		}
		if (parts.length) return parts.join(', ')
		const keys = Object.keys(value).slice(0, 8)
		return keys.length ? keys.map(key => `${key}=${summarizeValue(value[key], 60)}`).join(', ') : '{}'
	}
	return String(value)
}

function toolArgSummary(args) {
	if (!args || typeof args !== 'object') return ''
	const keys = Object.keys(args)
	if (!keys.length) return 'no arguments'
	return keys.map(key => `${key}: ${summarizeValue(args[key], 80)}`).join(' | ')
}

function responseSummary(payload) {
	if (!payload) return 'No response payload'
	if (payload.ok === false) return `Error: ${payload.error?.message || summarizeValue(payload.error || payload)}`
	if (payload.ok === true && payload.data !== undefined) return summarizeValue(payload.data)
	if (payload.isError) return `Error: ${summarizeValue(payload)}`
	return summarizeValue(payload)
}

function responseStatus(payload, response) {
	if (response?.isError || payload?.ok === false || payload?.error) return 'error'
	const errorCount = Number(payload?.data?.errorCount ?? payload?.errorCount ?? 0)
	return errorCount > 0 ? 'warning' : 'ok'
}

function eventSessionKey(event) {
	return firstValue(event, ['data.sessionId', 'data.headers.mcp-session-id', 'data.clientInfo.name'])
}

function eventSummary(event) {
	const data = event.data || {}
	const pieces = []
	if (data.status) pieces.push(`status=${data.status}`)
	if (data.toolCount !== undefined) pieces.push(`tools=${data.toolCount}`)
	if (data.sessionCount !== undefined) pieces.push(`sessions=${data.sessionCount}`)
	if (data.clientInfo?.name) pieces.push(`client=${data.clientInfo.name}`)
	if (data.path) pieces.push(String(data.path))
	if (data.file) pieces.push(String(data.file))
	if (data.result?.path) pieces.push(String(data.result.path))
	if (data.result?.error) pieces.push(String(data.result.error))
	if (data.error?.message) pieces.push(String(data.error.message))
	if (data.args && typeof data.args === 'object') {
		const keys = Object.keys(data.args).slice(0, 6)
		if (keys.length) pieces.push(`args=${keys.join(',')}`)
	}
	if (!pieces.length) {
		const text = JSON.stringify(data)
		if (text && text !== '{}') pieces.push(text)
	}
	return pieces.join(' | ').slice(0, 260)
}

function parseNdjsonLines(lines, fileName, lineBase = 0) {
	const events = []
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index].trim()
		if (!line) continue
		try {
			const event = JSON.parse(line)
			event.__file = fileName
			event.__line = lineBase + index + 1
			event.__raw = line
			events.push(event)
		} catch (error) {
			events.push({
				ts: '',
				seq: lineBase + index + 1,
				type: 'viewer.parse_error',
				__file: fileName,
				__line: lineBase + index + 1,
				data: { message: error.message, line: line.slice(0, 500) },
			})
		}
	}
	return events
}

function parseNdjson(text, fileName) {
	return parseNdjsonLines(text.split(/\r?\n/), fileName)
}

async function loadFiles(files) {
	stopLive()
	const loaded = []
	for (const file of files) {
		const text = await file.text()
		loaded.push(...parseNdjson(text, file.name))
	}
	state.events = loaded.sort((a, b) => {
		const at = Date.parse(a.ts || '') || 0
		const bt = Date.parse(b.ts || '') || 0
		return at - bt || (a.seq || 0) - (b.seq || 0)
	})
	state.fileNames = Array.from(files).map(file => file.name)
	state.selectedGroup = ''
	state.selectedIndex = -1
	state.selectedConversationIndex = -1
	refreshTypes()
	applyFilters()
}

function appendEvents(events) {
	if (!events.length) return
	state.events.push(...events)
	state.events.sort((a, b) => {
		const at = Date.parse(a.ts || '') || 0
		const bt = Date.parse(b.ts || '') || 0
		return at - bt || (a.seq || 0) - (b.seq || 0)
	})
	refreshTypes()
	applyFilters()
}

function loggerFileName(logger) {
	if (!logger?.file) return 'live log'
	return logger.file.split(/[\\/]/).pop()
}

function setLiveStatus(text, mode = '') {
	els.liveStatus.textContent = text
	els.liveStatus.classList.toggle('on', mode === 'on')
	els.liveStatus.classList.toggle('warn', mode === 'warn')
	els.liveButton.textContent = state.live.enabled ? 'Pause live' : 'Start live'
}

async function startLive() {
	stopLive(false)
	state.live.enabled = true
	setLiveStatus('Live: loading', 'warn')
	try {
		const response = await fetch('/log-viewer/api/current?maxLines=5000')
		const payload = await response.json()
		if (!payload.ok) throw new Error(payload.error || 'Unable to load current log')
		state.live.offset = payload.offset || 0
		state.live.logger = payload.logger || null
		state.events = parseNdjsonLines(payload.lines || [], loggerFileName(payload.logger))
		state.fileNames = [loggerFileName(payload.logger)]
		state.selectedGroup = ''
		state.selectedIndex = -1
		state.selectedConversationIndex = -1
		refreshTypes()
		applyFilters()
		openLiveStream()
	} catch (error) {
		state.live.enabled = false
		setLiveStatus('Live: error', 'warn')
		els.fileMeta.textContent = `Live log unavailable: ${error.message}`
	}
}

function openLiveStream() {
	if (!state.live.enabled) return
	if (state.live.source) state.live.source.close()
	const source = new EventSource(`/log-viewer/api/stream?offset=${encodeURIComponent(state.live.offset || 0)}`)
	state.live.source = source
	setLiveStatus('Live: on', 'on')

	source.addEventListener('ready', event => {
		const payload = JSON.parse(event.data)
		state.live.logger = payload.logger || state.live.logger
		setLiveStatus('Live: on', 'on')
	})
	source.addEventListener('append', event => {
		const payload = JSON.parse(event.data)
		state.live.offset = payload.offset || state.live.offset
		state.live.logger = payload.logger || state.live.logger
		state.fileNames = [loggerFileName(state.live.logger)]
		appendEvents(parseNdjsonLines(payload.lines || [], loggerFileName(state.live.logger), state.events.length))
	})
	source.addEventListener('rotate', event => {
		const payload = JSON.parse(event.data)
		state.live.offset = payload.offset || 0
		state.live.logger = payload.logger || null
		state.events = []
		state.fileNames = [loggerFileName(state.live.logger)]
		state.selectedGroup = ''
		state.selectedIndex = -1
		state.selectedConversationIndex = -1
		refreshTypes()
		applyFilters()
	})
	source.addEventListener('truncate', event => {
		const payload = JSON.parse(event.data)
		state.live.offset = payload.offset || 0
		state.events = []
		state.selectedIndex = -1
		state.selectedConversationIndex = -1
		refreshTypes()
		applyFilters()
	})
	source.addEventListener('stream_error', event => {
		console.warn('log stream error', event.data)
		setLiveStatus('Live: retrying', 'warn')
	})
	source.addEventListener('heartbeat', event => {
		const payload = JSON.parse(event.data)
		state.live.offset = payload.offset || state.live.offset
		state.live.logger = payload.logger || state.live.logger
		setLiveStatus('Live: on', 'on')
	})
	source.onerror = () => {
		if (!state.live.enabled) return
		setLiveStatus('Live: retrying', 'warn')
		source.close()
		clearTimeout(state.live.reconnectTimer)
		state.live.reconnectTimer = setTimeout(openLiveStream, 1500)
	}
}

function stopLive(updateStatus = true) {
	state.live.enabled = false
	if (state.live.source) state.live.source.close()
	state.live.source = null
	clearTimeout(state.live.reconnectTimer)
	state.live.reconnectTimer = null
	if (updateStatus) setLiveStatus('Live: off')
}

function refreshTypes() {
	const selected = els.typeFilter.value
	const types = [...new Set(state.events.map(event => event.type || 'unknown'))].sort()
	els.typeFilter.innerHTML = '<option value="">All</option>'
	for (const type of types) {
		const option = document.createElement('option')
		option.value = type
		option.textContent = type
		els.typeFilter.appendChild(option)
	}
	if (types.includes(selected)) els.typeFilter.value = selected
}

function applyFilters() {
	const type = els.typeFilter.value
	const query = els.textFilter.value.trim().toLowerCase()
	const onlyErrors = els.errorOnly.checked
	const groupMode = els.groupMode.value
	state.filtered = state.events.filter(event => {
		if (type && event.type !== type) return false
		if (onlyErrors && !isErrorEvent(event)) return false
		if (state.selectedGroup && groupKey(event, groupMode) !== state.selectedGroup) return false
		if (query) {
			const haystack = [
				event.type,
				eventName(event),
				eventId(event),
				eventSummary(event),
				event.__file,
				JSON.stringify(event.data || {}),
			].join(' ').toLowerCase()
			if (!haystack.includes(query)) return false
		}
		return true
	})
	if (state.selectedIndex >= state.filtered.length) state.selectedIndex = -1
	if (state.selectedConversationIndex >= buildConversationItems().length) state.selectedConversationIndex = -1
	render()
}

function buildGroups() {
	const mode = els.groupMode.value
	const groups = new Map()
	for (const event of state.events) {
		const key = groupKey(event, mode)
		const item = groups.get(key) || { key, count: 0, errors: 0, firstTs: event.ts || '', lastTs: event.ts || '', duration: 0, clientName: '' }
		item.count += 1
		if (isErrorEvent(event)) item.errors += 1
		item.lastTs = event.ts || item.lastTs
		if (!item.clientName && event.data?.clientInfo?.name) item.clientName = event.data.clientInfo.name
		const duration = eventDuration(event)
		if (duration !== null) item.duration += duration
		groups.set(key, item)
	}
	return [...groups.values()].sort((a, b) => b.errors - a.errors || b.count - a.count || a.key.localeCompare(b.key))
}

function renderMetrics() {
	const errors = state.events.filter(isErrorEvent).length
	const toolCalls = state.events.filter(event => event.type === 'tool.call.start').length
	const durations = state.events.map(eventDuration).filter(value => value !== null)
	const avg = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0
	const groups = buildGroups()
	els.totalCount.textContent = String(state.events.length)
	els.toolCount.textContent = String(toolCalls)
	els.errorCount.textContent = String(errors)
	els.avgDuration.textContent = `${Math.round(avg)} ms`
	els.sessionCount.textContent = String(groups.length)
	els.visibleCount.textContent = `${state.filtered.length} shown`
	const sourcePrefix = state.live.enabled ? 'Live' : 'Loaded'
	els.fileMeta.textContent = state.fileNames.length
		? `${sourcePrefix}: ${state.fileNames.join(', ')} | ${state.events.length} events`
		: 'No log loaded'
	const times = state.filtered.map(event => Date.parse(event.ts || '')).filter(Boolean)
	if (times.length) {
		els.timeRange.textContent = `${new Date(Math.min(...times)).toLocaleString()} - ${new Date(Math.max(...times)).toLocaleString()}`
	} else {
		els.timeRange.textContent = '-'
	}
}

function renderGroups() {
	const groups = buildGroups()
	els.groupList.innerHTML = ''
	if (!groups.length) {
		els.groupList.innerHTML = '<div class="empty">No groups</div>'
		return
	}
	const allButton = document.createElement('button')
	allButton.type = 'button'
	allButton.className = `groupItem${state.selectedGroup ? '' : ' active'}`
	const totalErrors = state.events.filter(isErrorEvent).length
	allButton.innerHTML = `
		<span class="groupKey">All activity</span>
		<span>${state.events.length}</span>
		<span class="groupMeta">${totalErrors ? `${totalErrors} errors` : 'global'}</span>
		<span class="groupMeta"></span>
	`
	allButton.addEventListener('click', () => {
		state.selectedGroup = ''
		state.selectedConversationIndex = -1
		applyFilters()
	})
	els.groupList.appendChild(allButton)
	for (const group of groups) {
		const button = document.createElement('button')
		button.type = 'button'
		button.className = `groupItem${group.key === state.selectedGroup ? ' active' : ''}`
		const label = group.clientName || group.key
		const secondary = group.clientName ? compactId(group.key) : ''
		const status = group.errors ? `${group.errors} errors` : 'ok'
		const meta = secondary ? `${secondary} | ${status}` : status
		button.innerHTML = `
			<span class="groupKey">${escapeHtml(label)}</span>
			<span>${group.count}</span>
			<span class="groupMeta">${escapeHtml(meta)}</span>
			<span class="groupMeta">${group.duration ? `${Math.round(group.duration)} ms` : ''}</span>
		`
		button.addEventListener('click', () => {
			state.selectedGroup = state.selectedGroup === group.key ? '' : group.key
			state.selectedConversationIndex = -1
			applyFilters()
		})
		els.groupList.appendChild(button)
	}
}

function buildConversationItems() {
	const items = []
	const byRequest = new Map()
	const visible = state.filtered
	for (const event of visible) {
		const type = event.type || ''
		const data = event.data || {}
		if (type === 'http.session.opened') {
			items.push({
				kind: 'session',
				ts: event.ts,
				title: 'Session opened',
				subtitle: `${data.clientInfo?.name || 'unknown client'} ${data.clientInfo?.version || ''}`.trim(),
				status: 'ok',
				summary: compactId(data.sessionId || ''),
				events: [event],
			})
			continue
		}
		if (type === 'mcp.request.tools_list') {
			const item = {
				kind: 'request',
				ts: event.ts,
				requestId: data.requestId,
				sessionId: data.sessionId,
				clientInfo: data.clientInfo,
				title: 'List tools',
				subtitle: data.clientInfo?.name || compactId(data.sessionId || ''),
				status: 'pending',
				summary: 'Client requested the MCP tool catalog.',
				events: [event],
			}
			byRequest.set(data.requestId, item)
			items.push(item)
			continue
		}
		if (type === 'mcp.response.tools_list') {
			const item = byRequest.get(data.requestId)
			if (item) {
				item.status = 'ok'
				item.summary = `${data.toolCount ?? 0} tools returned.`
				item.events.push(event)
			} else {
				items.push({
					kind: 'response',
					ts: event.ts,
					title: 'Tool catalog response',
					subtitle: data.clientInfo?.name || compactId(data.sessionId || ''),
					status: 'ok',
					summary: `${data.toolCount ?? 0} tools returned.`,
					events: [event],
				})
			}
			continue
		}
		if (type === 'mcp.request.tools_call') {
			const item = {
				kind: 'tool',
				ts: event.ts,
				requestId: data.requestId,
				sessionId: data.sessionId,
				clientInfo: data.clientInfo,
				title: data.name || 'Tool call',
				subtitle: data.clientInfo?.name || compactId(data.sessionId || ''),
				status: 'pending',
				summary: toolArgSummary(data.args),
				events: [event],
				args: data.args,
			}
			byRequest.set(data.requestId, item)
			items.push(item)
			continue
		}
		if (type === 'mcp.response.tools_call') {
			const payload = responsePayload(event)
			const item = byRequest.get(data.requestId)
			const status = responseStatus(payload, data.response)
			if (item) {
				item.status = status
				item.response = payload
				item.responseTs = event.ts
				item.summary = responseSummary(payload)
				item.events.push(event)
			} else {
				items.push({
					kind: 'response',
					ts: event.ts,
					requestId: data.requestId,
					sessionId: data.sessionId,
					clientInfo: data.clientInfo,
					title: data.name || 'Tool response',
					subtitle: data.clientInfo?.name || compactId(data.sessionId || ''),
					status,
					summary: responseSummary(payload),
					events: [event],
					response: payload,
				})
			}
			continue
		}
		if (type === 'tool.call.throw' || type.endsWith('.error') || isErrorEvent(event)) {
			items.push({
				kind: 'error',
				ts: event.ts,
				title: data.name || type,
				subtitle: data.clientInfo?.name || compactId(eventSessionKey(event) || ''),
				status: 'error',
				summary: data.error?.message || eventSummary(event),
				events: [event],
			})
		}
	}
	return items
}

function renderConversation() {
	const items = buildConversationItems()
	els.conversationList.innerHTML = ''
	if (!items.length) {
		els.conversationList.innerHTML = '<div class="empty">No conversation events</div>'
		els.detailPane.textContent = '{}'
		return
	}
	const fragment = document.createDocumentFragment()
	items.forEach((item, index) => {
		const card = document.createElement('button')
		card.type = 'button'
		card.className = `conversationItem ${item.kind} ${item.status}${index === state.selectedConversationIndex ? ' active' : ''}`
		const elapsed = item.responseTs ? Date.parse(item.responseTs) - Date.parse(item.ts || '') : null
		const durationText = Number.isFinite(elapsed) ? `${Math.max(0, elapsed)} ms` : ''
		card.innerHTML = `
			<div class="conversationTime">${escapeHtml(formatTime(item.ts))}</div>
			<div class="conversationBody">
				<div class="conversationTop">
					<span class="conversationTitle">${escapeHtml(item.title)}</span>
					<span class="conversationStatus ${item.status}">${escapeHtml(item.status)}</span>
				</div>
				<div class="conversationSub">${escapeHtml(item.subtitle || '')}${durationText ? ` | ${durationText}` : ''}</div>
				<div class="conversationSummary">${escapeHtml(item.summary || '')}</div>
			</div>
		`
		card.addEventListener('click', () => {
			state.selectedConversationIndex = index
			state.selectedIndex = -1
			els.detailPane.textContent = JSON.stringify({
				title: item.title,
				status: item.status,
				sessionId: item.sessionId,
				clientInfo: item.clientInfo,
				args: item.args,
				response: item.response,
				events: item.events,
			}, null, 2)
			renderConversation()
		})
		fragment.appendChild(card)
	})
	els.conversationList.appendChild(fragment)
	if (state.selectedConversationIndex < 0) {
		state.selectedConversationIndex = 0
		els.detailPane.textContent = JSON.stringify(items[0], null, 2)
		renderConversation()
	}
}

function renderRows() {
	els.eventRows.innerHTML = ''
	if (!state.filtered.length) {
		els.eventRows.innerHTML = '<tr><td colspan="6" class="empty">No events</td></tr>'
		els.detailPane.textContent = '{}'
		return
	}
	const fragment = document.createDocumentFragment()
	state.filtered.forEach((event, index) => {
		const row = document.createElement('tr')
		const error = isErrorEvent(event)
		if (error) row.classList.add('error')
		if (index === state.selectedIndex) row.classList.add('active')
		const duration = eventDuration(event)
		row.innerHTML = `
			<td class="cellClip">${formatTime(event.ts)}</td>
			<td><span class="typePill${error ? ' error' : ''}">${escapeHtml(event.type || 'unknown')}</span></td>
			<td class="cellClip">${escapeHtml(eventName(event) || '-')}</td>
			<td class="cellClip">${escapeHtml(compactId(eventId(event))) || '-'}</td>
			<td class="duration">${duration === null ? '' : Math.round(duration)}</td>
			<td>${escapeHtml(eventSummary(event))}</td>
		`
		row.addEventListener('click', () => {
			state.selectedIndex = index
			els.detailPane.textContent = JSON.stringify(event, null, 2)
			renderRows()
		})
		fragment.appendChild(row)
	})
	els.eventRows.appendChild(fragment)
	if (state.selectedIndex < 0) {
		state.selectedIndex = 0
		els.detailPane.textContent = JSON.stringify(state.filtered[0], null, 2)
		renderRows()
	}
}

function render() {
	renderMetrics()
	renderGroups()
	els.conversationView.classList.toggle('hidden', state.viewMode !== 'conversation')
	els.timelineView.classList.toggle('hidden', state.viewMode !== 'timeline')
	els.conversationViewButton.classList.toggle('active', state.viewMode === 'conversation')
	els.timelineViewButton.classList.toggle('active', state.viewMode === 'timeline')
	els.mainPanelTitle.textContent = state.viewMode === 'conversation' ? 'Conversation' : 'Timeline'
	if (state.viewMode === 'conversation') renderConversation()
	else renderRows()
}

function setViewMode(mode) {
	state.viewMode = mode === 'timeline' ? 'timeline' : 'conversation'
	state.selectedIndex = -1
	state.selectedConversationIndex = -1
	render()
}

function formatTime(value) {
	const time = Date.parse(value || '')
	if (!time) return ''
	return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function escapeHtml(value) {
	return String(value ?? '').replace(/[&<>"']/g, char => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	}[char]))
}

function reset() {
	state.events = []
	state.filtered = []
	state.fileNames = []
	state.selectedGroup = ''
	state.selectedIndex = -1
	state.selectedConversationIndex = -1
	els.typeFilter.innerHTML = '<option value="">All</option>'
	els.textFilter.value = ''
	els.errorOnly.checked = false
	render()
}

els.fileInput.addEventListener('change', event => {
	const files = [...event.target.files]
	if (files.length) loadFiles(files)
})

for (const name of ['dragenter', 'dragover']) {
	els.dropZone.addEventListener(name, event => {
		event.preventDefault()
		els.dropZone.classList.add('dragging')
	})
}

for (const name of ['dragleave', 'drop']) {
	els.dropZone.addEventListener(name, event => {
		event.preventDefault()
		els.dropZone.classList.remove('dragging')
	})
}

els.dropZone.addEventListener('drop', event => {
	const files = [...event.dataTransfer.files]
	if (files.length) loadFiles(files)
})

for (const el of [els.typeFilter, els.textFilter, els.groupMode, els.errorOnly]) {
	el.addEventListener('input', () => {
		if (el === els.groupMode) state.selectedGroup = ''
		state.selectedIndex = -1
		state.selectedConversationIndex = -1
		applyFilters()
	})
}

els.clearButton.addEventListener('click', reset)
els.copyButton.addEventListener('click', async () => {
	try {
		await navigator.clipboard.writeText(els.detailPane.textContent)
		els.copyButton.textContent = 'Copied'
		setTimeout(() => { els.copyButton.textContent = 'Copy JSON' }, 900)
	} catch (_) {
		els.detailPane.focus()
	}
})

els.liveButton.addEventListener('click', () => {
	if (state.live.enabled) stopLive()
	else startLive()
})

els.conversationViewButton.addEventListener('click', () => setViewMode('conversation'))
els.timelineViewButton.addEventListener('click', () => setViewMode('timeline'))

reset()
startLive()
