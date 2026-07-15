import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { ApiPlugin, ApiServerOptions, ViteDevServer } from '../index'
import { createJsonAuthPlugin, createServer } from '../index'

const root = fileURLToPath(new URL('./fixtures/api/basic', import.meta.url))

describe('dev server api middleware', () => {
  let server: ViteDevServer | undefined

  afterEach(async () => {
    if (server) {
      await server.close()
      server = undefined
    }
  })

  async function startServer(apiOptions?: ApiServerOptions) {
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
    expect(head.headers['set-cookie']).toEqual(['a=1; Path=/', 'b=2; Path=/'])
    expect(head.text ?? '').toBe('')
  })

  it('runs API plugins before filesystem handlers', async () => {
    const plugins: ApiPlugin[] = [
      {
        name: 'test-api-plugin',
        handle(context) {
          if (context.route === '/plugin-response') {
            return { handledBy: context.method, route: context.route }
          }
          if (context.route === '/plugin-state') {
            ;(context.req as typeof context.req & { user?: unknown }).user = {
              name: 'Plugin User',
            }
          }
        },
      },
    ]
    const server = await startServer({ plugins })
    const agent = request(server.middlewares)

    const pluginResponse = await agent.get('/api/plugin-response').expect(200)
    expect(pluginResponse.body).toEqual({
      handledBy: 'GET',
      route: '/plugin-response',
    })

    const stateResponse = await agent.get('/api/plugin-state').expect(200)
    expect(stateResponse.body).toEqual({ user: { name: 'Plugin User' } })
  })

  it('provides JSON auth helpers for direct frontend API calls', async () => {
    const server = await startServer({
      plugins: [
        createJsonAuthPlugin({
          users: {
            demo: {
              password: 'secret',
              profile: { name: 'Demo User' },
            },
          },
          publicRoutes: ['/auth/json/login'],
        }),
      ],
    })
    const agent = request(server.middlewares)

    await agent.get('/api/profile').expect(401, { error: 'Unauthorized' })

    const login = await agent
      .post('/api/auth/json/login')
      .send({ username: 'demo', password: 'secret' })
      .expect(200)
    expect(login.body.user).toEqual({ username: 'demo', name: 'Demo User' })
    expect(login.body.token).toEqual(expect.any(String))

    const profile = await agent
      .get('/api/profile')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200)
    expect(profile.body).toEqual({
      user: { username: 'demo', name: 'Demo User' },
    })
  })
})
