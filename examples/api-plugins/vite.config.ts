import { defineConfig, type ApiPlugin } from 'vite'

type TimedRequest = Parameters<NonNullable<ApiPlugin['handle']>>[0]['req'] & {
  apiStartedAt?: number
}

const requestTimer: ApiPlugin = {
  name: 'example-request-timer',
  handle(context) {
    ;(context.req as TimedRequest).apiStartedAt = Date.now()
    context.res.setHeader('x-api-plugin', 'request-timer')
  },
}

const mockHealth: ApiPlugin = {
  name: 'example-mock-health',
  handle(context) {
    if (context.route === '/health') {
      return {
        ok: true,
        route: context.route,
        handledBy: 'server.api.plugins',
      }
    }
  },
}

export default defineConfig({
  server: {
    api: {
      plugins: [requestTimer, mockHealth],
    },
  },
})
