import { randomBytes } from 'node:crypto'
import { URLSearchParams } from 'node:url'
import type { ApiPlugin } from '../plugin'

export type OAuthProviderName = 'google' | 'github'

export interface OAuthProviderOptions {
  clientId: string
  clientSecret: string
  redirectUri: string
  scope?: string[]
  /**
   * Optional override to customize the authorize path (defaults to `/auth/{provider}`).
   */
  loginPath?: string
  /**
   * Optional override to customize the callback path (defaults to `/auth/{provider}/callback`).
   */
  callbackPath?: string
}

export interface OAuthPluginOptions {
  basePath?: string
  providers: Partial<Record<OAuthProviderName, OAuthProviderOptions>>
  /**
   * Number of milliseconds an authorization state value remains valid.
   *
   * @default 5 * 60 * 1000
   */
  stateTtlMs?: number
}

interface OAuthProviderRuntime {
  name: OAuthProviderName
  loginPath: string
  callbackPath: string
  options: OAuthProviderOptions
}

interface StateRecord {
  provider: OAuthProviderName
  expiresAt: number
}

const DEFAULT_BASE_PATH = '/auth'
const DEFAULT_STATE_TTL = 5 * 60 * 1000

export function createOAuthPlugin(options: OAuthPluginOptions): ApiPlugin {
  const basePath = options.basePath ?? DEFAULT_BASE_PATH
  const ttl = options.stateTtlMs ?? DEFAULT_STATE_TTL
  const providers = normalizeProviders(basePath, options.providers)
  const states = new Map<string, StateRecord>()

  function rememberState(provider: OAuthProviderName): string {
    const value = randomBytes(24).toString('base64url')
    states.set(value, { provider, expiresAt: Date.now() + ttl })
    return value
  }

  function verifyState(expectedProvider: OAuthProviderName, received: string | null): boolean {
    if (!received) {
      return false
    }
    const record = states.get(received)
    if (!record || record.provider !== expectedProvider) {
      return false
    }
    states.delete(received)
    if (record.expiresAt < Date.now()) {
      return false
    }
    return true
  }

  return {
    name: 'vite:api-oauth',
    async handle(context) {
      const { route, method, res, url } = context
      const provider = providers.find(
        (entry) => route === entry.loginPath || route === entry.callbackPath,
      )
      if (!provider) {
        return undefined
      }

      if (route === provider.loginPath) {
        if (method !== 'GET') {
          res.statusCode = 405
          res.setHeader('Allow', 'GET')
          return { error: 'Method Not Allowed' }
        }
        const state = rememberState(provider.name)
        const location = buildAuthorizeUrl(provider, state)
        res.statusCode = 302
        res.setHeader('Location', location)
        res.end()
        context.handled = true
        return undefined
      }

      if (route === provider.callbackPath) {
        if (method !== 'GET') {
          res.statusCode = 405
          res.setHeader('Allow', 'GET')
          return { error: 'Method Not Allowed' }
        }
        const requestUrl = new URL(url, 'http://localhost')
        const code = requestUrl.searchParams.get('code')
        const state = requestUrl.searchParams.get('state')
        if (!code) {
          res.statusCode = 400
          return { error: 'Missing authorization code' }
        }
        if (!verifyState(provider.name, state)) {
          res.statusCode = 400
          return { error: 'Invalid OAuth state' }
        }

        const tokenResponse = await exchangeCodeForToken(provider, code)
        if (tokenResponse.error) {
          res.statusCode = tokenResponse.status ?? 502
          return { error: tokenResponse.error }
        }

        const profile = await fetchUserProfile(provider, tokenResponse.accessToken)
        if (profile.error) {
          res.statusCode = profile.status ?? 502
          return { error: profile.error }
        }

        return {
          provider: provider.name,
          tokens: tokenResponse.tokens,
          profile: profile.profile,
        }
      }

      return undefined
    },
  }
}

function normalizeProviders(
  basePath: string,
  providers: Partial<Record<OAuthProviderName, OAuthProviderOptions>>,
): OAuthProviderRuntime[] {
  const entries: OAuthProviderRuntime[] = []
  for (const name of Object.keys(providers) as OAuthProviderName[]) {
    const opts = providers[name]
    if (!opts) continue
    if (!opts.clientId || !opts.clientSecret || !opts.redirectUri) {
      continue
    }
    const loginPath = opts.loginPath ?? `${basePath}/${name}`
    const callbackPath = opts.callbackPath ?? `${loginPath}/callback`
    entries.push({ name, options: opts, loginPath, callbackPath })
  }
  return entries
}

function buildAuthorizeUrl(provider: OAuthProviderRuntime, state: string): string {
  const { name, options } = provider
  const url = new URL(getAuthorizeEndpoint(name))
  url.searchParams.set('client_id', options.clientId)
  url.searchParams.set('redirect_uri', options.redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('response_type', 'code')
  const scope = options.scope?.length ? options.scope.join(' ') : getDefaultScope(name)
  if (scope) {
    url.searchParams.set('scope', scope)
  }
  if (name === 'google') {
    url.searchParams.set('access_type', 'offline')
    url.searchParams.set('include_granted_scopes', 'true')
    url.searchParams.set('prompt', 'consent')
  }
  return url.toString()
}

async function exchangeCodeForToken(
  provider: OAuthProviderRuntime,
  code: string,
): Promise<
  | { error: string; status?: number }
  | { accessToken: string; tokens: Record<string, unknown> }
> {
  const { name, options } = provider
  const params = new URLSearchParams({
    client_id: options.clientId,
    client_secret: options.clientSecret,
    redirect_uri: options.redirectUri,
    code,
  })
  if (name === 'google') {
    params.set('grant_type', 'authorization_code')
  }

  const fetchFn = globalThis.fetch
  if (!fetchFn) {
    return { error: 'Global fetch is not available in this environment', status: 500 }
  }

  const response = await fetchFn(getTokenEndpoint(name), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      ...(name === 'github' ? { 'User-Agent': 'vite-dev-server' } : {}),
    },
    body: params,
  })

  if (!response.ok) {
    const message = await safeReadError(response)
    return { error: message ?? 'Failed to exchange OAuth code', status: response.status }
  }

  const tokens = (await response.json()) as Record<string, unknown>
  const accessToken = (tokens.access_token ?? tokens.accessToken) as string | undefined
  if (!accessToken) {
    return { error: 'OAuth provider did not return an access token' }
  }

  return { accessToken, tokens }
}

async function fetchUserProfile(
  provider: OAuthProviderRuntime,
  accessToken: string,
): Promise<{ error: string; status?: number } | { profile: Record<string, unknown> }> {
  const fetchFn = globalThis.fetch
  if (!fetchFn) {
    return { error: 'Global fetch is not available in this environment', status: 500 }
  }

  const response = await fetchFn(getUserInfoEndpoint(provider.name), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(provider.name === 'github' ? { 'User-Agent': 'vite-dev-server' } : {}),
    },
  })

  if (!response.ok) {
    const message = await safeReadError(response)
    return { error: message ?? 'Failed to fetch user profile', status: response.status }
  }

  const profile = (await response.json()) as Record<string, unknown>
  return { profile }
}

function getAuthorizeEndpoint(provider: OAuthProviderName): string {
  return provider === 'google'
    ? 'https://accounts.google.com/o/oauth2/v2/auth'
    : 'https://github.com/login/oauth/authorize'
}

function getTokenEndpoint(provider: OAuthProviderName): string {
  return provider === 'google'
    ? 'https://oauth2.googleapis.com/token'
    : 'https://github.com/login/oauth/access_token'
}

function getUserInfoEndpoint(provider: OAuthProviderName): string {
  return provider === 'google'
    ? 'https://www.googleapis.com/oauth2/v3/userinfo'
    : 'https://api.github.com/user'
}

function getDefaultScope(provider: OAuthProviderName): string {
  return provider === 'google'
    ? 'openid email profile'
    : 'read:user user:email'
}

async function safeReadError(response: globalThis.Response): Promise<string | null> {
  try {
    const text = await response.text()
    return text ? text.slice(0, 2000) : null
  } catch {
    return null
  }
}
