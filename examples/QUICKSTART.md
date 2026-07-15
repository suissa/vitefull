# Quickstart: using Vite direct API routes

This guide shows how to use the dev-server API route system from a frontend-only Vite app.

## 1. Install dependencies

From the repository root:

```bash
pnpm install
```

## 2. Run an example

Choose one example and start its dev server:

```bash
pnpm --filter vite-example-api-basic dev
```

Then open the local URL printed by Vite.

## 3. Create a route

Create a file inside `src/api`:

```ts
// src/api/hello.ts
export const GET = () => {
  return { message: 'Hello from Vite API routes' }
}
```

Now frontend code can call it directly:

```ts
const response = await fetch('/api/hello')
const data = await response.json()
console.log(data)
```

## 4. Use HTTP method exports

Export handlers named after HTTP methods:

```ts
// src/api/messages.ts
import type { IncomingMessage } from 'node:http'

export const GET = () => [{ id: 1, text: 'First message' }]

export const POST = async (req: IncomingMessage) => {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  return {
    saved: true,
    body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
  }
}
```

## 5. Customize the API prefix or directory

Use `server.api` in `vite.config.ts`:

```ts
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    api: {
      prefix: '/functions',
      dir: 'server/api',
    },
  },
})
```

With this config, `server/api/hello.ts` is available at `/functions/hello`.

## 6. Add request-level plugins

Plugins run before filesystem route handlers. They can return a response early, set headers, or attach information to the request.

```ts
import { defineConfig, type ApiPlugin } from 'vite'

const apiLogger: ApiPlugin = {
  name: 'api-logger',
  handle({ method, route, res }) {
    console.log(`[api] ${method} ${route}`)
    res.setHeader('x-powered-by', 'vite-api')
  },
}

export default defineConfig({
  server: {
    api: {
      plugins: [apiLogger],
    },
  },
})
```

## 7. Add JSON auth

Use `createJsonAuthPlugin` for a local development auth flow:

```ts
import { createJsonAuthPlugin, defineConfig } from 'vite'

export default defineConfig({
  server: {
    api: {
      plugins: [
        createJsonAuthPlugin({
          users: {
            demo: {
              password: 'demo',
              profile: { name: 'Demo User' },
            },
          },
          publicRoutes: ['/auth/json/login'],
        }),
      ],
    },
  },
})
```

Frontend login call:

```ts
const response = await fetch('/api/auth/json/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'demo', password: 'demo' }),
})
const { token } = await response.json()
```

Protected call:

```ts
await fetch('/api/profile', {
  headers: { Authorization: `Bearer ${token}` },
})
```

## Notes

- This system is meant for local development and frontend integration demos.
- Tokens issued by `createJsonAuthPlugin` are stored in memory and reset when the dev server restarts.
- For production deployments, use your platform's serverless functions, edge functions, or a dedicated backend.
