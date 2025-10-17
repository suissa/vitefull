import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import type { ApiPlugin, ApiServerOptions, ViteDevServer } from '../index'
import {
  createJsonAuthPlugin,
  createOAuthPlugin,
  createServer,
} from '../index'

const basicRoot = fileURLToPath(new URL('./fixtures/api/basic', import.meta.url))
const pluginRoot = fileURLToPath(new URL('./fixtures/api/plugins', import.meta.url))

describe('dev server api middleware', () => {
  let server: ViteDevServer | undefined

  afterEach(async () => {
    if (server) {
      await server.close()
      server = undefined
    }
  })

  async function startServer(
    apiOptions?: ApiServerOptions,
    root: string = basicRoot,
  ) {
    server = await createServer({
      root,
      logLevel: 'error',
      server: {
        watch: null,
        api: apiOptions ?? {},
      },
    })
    return server
  }

  it('resolves files under the configured prefix and directory', async () => {
    const server = await startServer()
    const agent = request(server.middlewares)

    const rootResponse = await agent.get('/api').expect(200)
    expect(rootResponse.body).toEqual({ message: 'root' })

    const nestedResponse = await agent.get('/api/nested').expect(200)
    expect(nestedResponse.text).toBe('nested')

    const explicitFile = await agent.get('/api/hello').expect(200)
    expect(explicitFile.body).toEqual({ greeting: 'hello' })
  })

  it('picks handlers by HTTP method and reports unsupported methods', async () => {
    const server = await startServer()
    const agent = request(server.middlewares)

    const getResponse = await agent.get('/api/methods').expect(200)
    expect(getResponse.body).toEqual({ method: 'GET' })

    const postResponse = await agent.post('/api/methods').expect(200)
    expect(postResponse.text).toBe('posted')

    const methodNotAllowed = await agent.delete('/api/methods').expect(405)
    expect(methodNotAllowed.text).toBe('Method Not Allowed')
    expect(methodNotAllowed.headers['allow']).toBe('GET, POST')
  })

  it('adapts web Response instances including headers and HEAD requests', async () => {
    const server = await startServer({
      prefix: '/functions',
      dir: join('src', 'api'),
    })
    const agent = request(server.middlewares)

    const response = await agent.get('/functions/web-response').expect(201)
    expect(response.text).toBe('web-response')
    expect(response.headers['x-handler']).toBe('GET')
    expect(response.headers['set-cookie']).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
    ])

    const head = await agent.head('/functions/web-response').expect(201)
    expect(head.headers['x-handler']).toBe('HEAD')
    expect(head.headers['set-cookie']).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
    ])
    expect(head.text ?? '').toBe('')
  })

  it('supports plugins that intercept requests and share state', async () => {
    const interceptPlugin: ApiPlugin = {
      name: 'interceptor',
      handle(context) {
        if (context.route === '/plugin-only') {
          context.res.statusCode = 200
          return { source: 'plugin' }
        }
        if (context.route === '/stateful') {
          context.state.message = 'from plugin'
          ;(context.req as Record<string, unknown>).pluginMessage = context.state.message
        }
        return undefined
      },
    }

    const server = await startServer(
      {
        plugins: [interceptPlugin],
      },
      pluginRoot,
    )
    const agent = request(server.middlewares)

    const pluginOnly = await agent.get('/api/plugin-only').expect(200)
    expect(pluginOnly.body).toEqual({ source: 'plugin' })

    const stateful = await agent.get('/api/stateful').expect(200)
    expect(stateful.body).toEqual({ message: 'from plugin', handledBy: 'module' })
  })

  it('implements json auth flows for login, protected routes, and logout', async () => {
    const server = await startServer(
      {
        plugins: [
          createJsonAuthPlugin({
            users: {
              'user@example.com': {
                password: 'secret',
                profile: { name: 'Test User' },
              },
            },
            publicRoutes: ['/', '/auth/json/login'],
          }),
        ],
      },
      pluginRoot,
    )
    const agent = request(server.middlewares)

    const unauthorized = await agent.get('/api/profile').expect(401)
    expect(unauthorized.body).toEqual({ error: 'Unauthorized' })

    const login = await agent
      .post('/api/auth/json/login')
      .send({ username: 'user@example.com', password: 'secret' })
      .expect(200)

    expect(login.body.user).toEqual({ username: 'user@example.com', name: 'Test User' })
    expect(typeof login.body.token).toBe('string')

    const profile = await agent
      .get('/api/profile')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200)
    expect(profile.body).toEqual({ user: { username: 'user@example.com', name: 'Test User' } })

    await agent
      .post('/api/auth/json/logout')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(204)

    const expired = await agent
      .get('/api/profile')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(401)
    expect(expired.body.error).toBe('Unauthorized')
  })

  it('builds oauth redirects and adapts callback responses', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input: Parameters<typeof fetch>[0]) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('oauth2.googleapis.com')) {
          return new Response(JSON.stringify({ access_token: 'google-token' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url.includes('oauth2/v3/userinfo')) {
          return new Response(JSON.stringify({ sub: '123', email: 'user@example.com' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        throw new Error(`Unexpected fetch call to ${url}`)
      })

    try {
      const server = await startServer(
        {
          plugins: [
            createOAuthPlugin({
              basePath: '/auth',
              providers: {
                google: {
                  clientId: 'id',
                  clientSecret: 'secret',
                  redirectUri: 'http://localhost:5173/api/auth/google/callback',
                },
              },
            }),
          ],
        },
        pluginRoot,
      )
      const agent = request(server.middlewares)

      const redirect = await agent.get('/api/auth/google').expect(302)
      expect(redirect.headers.location).toMatch(
        /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/,
      )

      const location = new URL(redirect.headers.location as string)
      const state = location.searchParams.get('state')
      expect(state).toBeTruthy()

      const callback = await agent
        .get(`/api/auth/google/callback?code=abc123&state=${state}`)
        .expect(200)

      expect(callback.body).toEqual({
        provider: 'google',
        tokens: { access_token: 'google-token' },
        profile: { sub: '123', email: 'user@example.com' },
      })
    } finally {
      fetchSpy.mockRestore()
    }
  })
})
