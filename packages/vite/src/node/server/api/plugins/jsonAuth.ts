import { randomBytes } from 'node:crypto'
import { Buffer } from 'node:buffer'
import type { IncomingMessage } from 'node:http'
import type { ApiPlugin } from '../plugin'

export interface JsonAuthUser {
  password: string
  profile?: Record<string, unknown>
}

export interface JsonAuthPluginOptions {
  users: Record<string, JsonAuthUser>
  /**
   * Path (relative to the API prefix) that accepts POST credentials.
   *
   * @default '/auth/json/login'
   */
  loginPath?: string
  /**
   * Path (relative to the API prefix) that revokes a token via POST or DELETE.
   *
   * @default '/auth/json/logout'
   */
  logoutPath?: string
  /**
   * Header examined for bearer tokens.
   *
   * @default 'authorization'
   */
  tokenHeader?: string
  /**
   * Prefix expected in the token header value.
   *
   * @default 'Bearer '
   */
  tokenPrefix?: string
  /**
   * Routes that should bypass authentication checks.
   */
  publicRoutes?: (string | RegExp)[]
  /**
   * How long issued tokens remain valid in milliseconds.
   *
   * @default 1000 * 60 * 60 (one hour)
   */
  sessionDurationMs?: number
}

interface SessionRecord {
  username: string
  issuedAt: number
  expiresAt: number
}

interface ParsedCredentials {
  username?: string
  password?: string
}

const DEFAULT_LOGIN_PATH = '/auth/json/login'
const DEFAULT_LOGOUT_PATH = '/auth/json/logout'
const DEFAULT_HEADER = 'authorization'
const DEFAULT_PREFIX = 'Bearer '
const DEFAULT_TTL = 60 * 60 * 1000

export function createJsonAuthPlugin(options: JsonAuthPluginOptions): ApiPlugin {
  const loginPath = options.loginPath ?? DEFAULT_LOGIN_PATH
  const logoutPath = options.logoutPath ?? DEFAULT_LOGOUT_PATH
  const tokenHeader = options.tokenHeader?.toLowerCase() ?? DEFAULT_HEADER
  const tokenPrefix = options.tokenPrefix ?? DEFAULT_PREFIX
  const ttl = options.sessionDurationMs ?? DEFAULT_TTL
  const sessions = new Map<string, SessionRecord>()

  function issueToken(username: string): { token: string; session: SessionRecord } {
    const token = randomBytes(24).toString('base64url')
    const issuedAt = Date.now()
    const expiresAt = issuedAt + ttl
    const session = { username, issuedAt, expiresAt }
    sessions.set(token, session)
    return { token, session }
  }

  function verifyToken(rawToken: string | null | undefined): SessionRecord | null {
    if (!rawToken) {
      return null
    }
    const token = rawToken.startsWith(tokenPrefix)
      ? rawToken.slice(tokenPrefix.length).trim()
      : rawToken.trim()
    const record = sessions.get(token)
    if (!record) {
      return null
    }
    if (record.expiresAt <= Date.now()) {
      sessions.delete(token)
      return null
    }
    return record
  }

  function clearToken(rawToken: string | null | undefined): boolean {
    if (!rawToken) {
      return false
    }
    const token = rawToken.startsWith(tokenPrefix)
      ? rawToken.slice(tokenPrefix.length).trim()
      : rawToken.trim()
    return sessions.delete(token)
  }

  return {
    name: 'vite:api-json-auth',
    async handle(context) {
      const { route, method, req, res } = context

      if (route === loginPath && method === 'POST') {
        const credentials = await parseJsonBody(req)
        const username = credentials.username?.trim()
        const password = credentials.password
        if (!username || !password) {
          res.statusCode = 400
          return { error: 'Missing credentials' }
        }

        const user = options.users[username]
        if (!user || user.password !== password) {
          res.statusCode = 401
          return { error: 'Invalid username or password' }
        }

        const { token, session } = issueToken(username)
        const profile = user.profile ?? {}
        return {
          token,
          expiresAt: session.expiresAt,
          user: { username, ...profile },
        }
      }

      if (route === logoutPath && (method === 'POST' || method === 'DELETE')) {
        const removed = clearToken(req.headers[tokenHeader] as string | undefined)
        if (!removed) {
          res.statusCode = 400
          return { error: 'Missing or unknown token' }
        }
        res.statusCode = 204
        res.end()
        context.handled = true
        return undefined
      }

      if (isPublicRoute(route, options.publicRoutes)) {
        return undefined
      }

      const session = verifyToken(req.headers[tokenHeader] as string | undefined)
      if (!session) {
        res.statusCode = 401
        return { error: 'Unauthorized' }
      }

      const user = options.users[session.username]
      if (!user) {
        res.statusCode = 403
        return { error: 'User no longer exists' }
      }

      ;(req as Record<string, unknown>).user = {
        username: session.username,
        ...(user.profile ?? {}),
      }
      context.state.user = (req as Record<string, unknown>).user
      return undefined
    },
  }
}

function isPublicRoute(route: string, entries: (string | RegExp)[] | undefined): boolean {
  if (!entries || entries.length === 0) {
    return false
  }
  return entries.some((entry) => {
    if (typeof entry === 'string') {
      return route === entry
    }
    return entry.test(route)
  })
}

async function parseJsonBody(req: IncomingMessage): Promise<ParsedCredentials> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  if (chunks.length === 0) {
    return {}
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof data === 'object' && data ? (data as ParsedCredentials) : {}
  } catch {
    return {}
  }
}
