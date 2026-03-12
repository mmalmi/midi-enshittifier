import { createHash } from 'node:crypto'
import http from 'node:http'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.MIDI_ENSHITTIFIER_TEST_BACKEND_PORT || 7777)

const blobs = new Map()
const parameterized = new Map()
const replaceable = new Map()
const regular = []
const clientSubscriptions = new Map()

function hashHex(data) {
  return createHash('sha256').update(data).digest('hex')
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-SHA-256',
    'Access-Control-Allow-Methods': 'GET, HEAD, PUT, OPTIONS',
    'Content-Type': 'application/json',
  })
  res.end(JSON.stringify(payload))
}

function sendEmpty(res, status, extraHeaders = {}) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-SHA-256',
    'Access-Control-Allow-Methods': 'GET, HEAD, PUT, OPTIONS',
    ...extraHeaders,
  })
  res.end()
}

function getParameterizedKey(event) {
  if (event.kind < 30000 || event.kind >= 40000) return null
  const dTag = event.tags.find((tag) => tag[0] === 'd')?.[1] ?? ''
  return `${event.pubkey}:${event.kind}:${dTag}`
}

function getReplaceableKey(event) {
  if (event.kind === 0 || event.kind === 3 || (event.kind >= 10000 && event.kind < 20000)) {
    return `${event.pubkey}:${event.kind}`
  }
  return null
}

function allEvents() {
  return [...parameterized.values(), ...replaceable.values(), ...regular]
}

function storeEvent(event) {
  const parameterizedKey = getParameterizedKey(event)
  if (parameterizedKey) {
    parameterized.set(parameterizedKey, event)
    return
  }

  const replaceableKey = getReplaceableKey(event)
  if (replaceableKey) {
    replaceable.set(replaceableKey, event)
    return
  }

  regular.push(event)
}

function matchesFilter(event, filter) {
  if (filter.ids && !filter.ids.includes(event.id)) return false
  if (filter.kinds && !filter.kinds.includes(event.kind)) return false
  if (filter.authors && !filter.authors.includes(event.pubkey)) return false
  if (filter.since && event.created_at < filter.since) return false
  if (filter.until && event.created_at > filter.until) return false

  for (const [key, values] of Object.entries(filter)) {
    if (!key.startsWith('#') || !Array.isArray(values)) continue
    const tagName = key.slice(1)
    const matched = event.tags.some(([name, value]) => name === tagName && values.includes(value))
    if (!matched) return false
  }

  return true
}

function notifySubscribers(event) {
  for (const [ws, subscriptions] of clientSubscriptions.entries()) {
    if (ws.readyState !== ws.OPEN) continue
    for (const [subId, filters] of subscriptions.entries()) {
      if (filters.some((filter) => matchesFilter(event, filter))) {
        ws.send(JSON.stringify(['EVENT', subId, event]))
      }
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)

  if (req.method === 'OPTIONS') {
    sendEmpty(res, 204)
    return
  }

  if (req.method === 'PUT' && url.pathname === '/blossom/upload') {
    const chunks = []
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk))
    }

    const body = Buffer.concat(chunks)
    const expectedHash = String(req.headers['x-sha-256'] || '').toLowerCase()
    if (!expectedHash) {
      sendJson(res, 400, { error: 'Missing X-SHA-256 header' })
      return
    }

    const actualHash = hashHex(body)
    if (actualHash !== expectedHash) {
      sendJson(res, 400, { error: 'Hash mismatch', sha256: actualHash })
      return
    }

    if (blobs.has(actualHash)) {
      sendJson(res, 409, { sha256: actualHash })
      return
    }

    blobs.set(actualHash, body)
    sendJson(res, 200, { sha256: actualHash })
    return
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/blossom/')) {
    const match = url.pathname.match(/^\/blossom\/([a-f0-9]{64})\.bin$/)
    if (!match) {
      sendEmpty(res, 404)
      return
    }

    const blob = blobs.get(match[1])
    if (!blob) {
      sendEmpty(res, 404)
      return
    }

    const headers = {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(blob.length),
    }

    if (req.method === 'HEAD') {
      sendEmpty(res, 200, headers)
      return
    }

    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      ...headers,
    })
    res.end(blob)
    return
  }

  sendEmpty(res, 404)
})

const wss = new WebSocketServer({ noServer: true })

wss.on('connection', (ws) => {
  const subscriptions = new Map()
  clientSubscriptions.set(ws, subscriptions)

  ws.on('message', (raw) => {
    let message
    try {
      message = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (!Array.isArray(message) || typeof message[0] !== 'string') return

    switch (message[0]) {
      case 'REQ': {
        const [, subId, ...filters] = message
        if (typeof subId !== 'string') return
        subscriptions.set(subId, filters.filter((filter) => filter && typeof filter === 'object'))

        for (const event of allEvents()) {
          if (filters.some((filter) => matchesFilter(event, filter))) {
            ws.send(JSON.stringify(['EVENT', subId, event]))
          }
        }

        ws.send(JSON.stringify(['EOSE', subId]))
        break
      }
      case 'EVENT': {
        const [, event] = message
        if (!event || typeof event !== 'object' || typeof event.id !== 'string') return
        storeEvent(event)
        ws.send(JSON.stringify(['OK', event.id, true, '']))
        notifySubscribers(event)
        break
      }
      case 'CLOSE': {
        const [, subId] = message
        if (typeof subId === 'string') subscriptions.delete(subId)
        break
      }
      default:
        break
    }
  })

  ws.on('close', () => {
    clientSubscriptions.delete(ws)
  })
})

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`)
  if (url.pathname !== '/relay') {
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

server.listen(PORT, '127.0.0.1')

function shutdown() {
  for (const ws of clientSubscriptions.keys()) {
    ws.close()
  }

  wss.close(() => {
    server.close(() => {
      process.exit(0)
    })
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
