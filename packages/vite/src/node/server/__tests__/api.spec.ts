import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import request from 'supertest'
import type { ApiServerOptions, ViteDevServer } from '../index'
import { createServer } from '../index'

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
    expect(head.headers['set-cookie']).toEqual([
      'a=1; Path=/',
      'b=2; Path=/',
    ])
    expect(head.text ?? '').toBe('')
  })
})
