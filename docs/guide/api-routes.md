# API Routes

Vite's dev server can respond to HTTP requests using modules stored inside your
project. When [`server.api`](../config/server-options.md#server-api) is enabled,
any pathname that begins with the configured prefix (defaults to `/api`) will be
resolved to a file inside the configured directory (defaults to `src/api`). The
resolved module is loaded through [`server.ssrLoadModule`](./api-environment-frameworks.md#loadmodule),
so TypeScript, JSX, and other Vite transforms apply automatically.

## File-based handlers

Handlers can be exported either as the default export or as named exports that
match the incoming HTTP method. The return value is automatically transformed
into a response:

```ts [src/api/hello.ts]
export default () => ({ message: 'Hello from the Vite API' })
```

```ts [src/api/time.ts]
export const GET = () =>
  new Response(JSON.stringify({ now: Date.now() }), {
    headers: { 'Content-Type': 'application/json' },
  })

export const POST = async (req: Request) => {
  const body = await new Response(req.body).text()
  return `Received: ${body}`
}
```

Returning objects sends JSON, strings and buffers are passed through directly,
and returning a web standard `Response` gives complete control of the outgoing
payload.

## API plugins

In addition to filesystem routes, the API middleware supports request-level
plugins via the `server.api.plugins` option. A plugin receives an
`ApiRequestContext` containing the decoded pathname (`route`), the raw Node.js
`req`/`res` objects, and a mutable `state` bag for sharing data with other
plugins or route handlers. Plugins can:

- Return a value to send an immediate response without invoking the filesystem
  handler.
- Set `context.handled = true` after writing directly to `res`.
- Augment `req`, `res`, or `context.state` so downstream handlers can read
  computed information (for example, an authenticated user object).

```ts twoslash [vite.config.ts]
import { defineConfig, type ApiPlugin } from 'vite'

const requestLogger: ApiPlugin = {
  name: 'logger',
  handle({ route, method }) {
    console.log(`[api] ${method} ${route}`)
  },
}

export default defineConfig({
  server: {
    api: {
      plugins: [requestLogger],
    },
  },
})
```

### JSON auth plugin

The built-in [`createJsonAuthPlugin`](../config/server-options.md#server-api)
issues and verifies opaque bearer tokens stored in memory. Provide a credential
map and the plugin exposes `/auth/json/login` (POST) and `/auth/json/logout`
(POST/DELETE) routes relative to your API prefix.

```ts twoslash [vite.config.ts]
import { defineConfig, createJsonAuthPlugin } from 'vite'

export default defineConfig({
  server: {
    api: {
      plugins: [
        createJsonAuthPlugin({
          users: {
            'demo@example.com': {
              password: 'demo',
              profile: { name: 'Demo User' },
            },
          },
          publicRoutes: ['/', '/auth/json/login'],
        }),
      ],
    },
  },
})
```

Requests to other routes must supply an `Authorization: Bearer <token>`
header. When authenticated, the plugin attaches a `user` object to the Node.js
request so filesystem handlers can access it:

```ts [src/api/profile.ts]
export const GET = (req: Request) => {
  const user = (req as Record<string, unknown>).user
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }
  return Response.json({ user })
}
```

### OAuth plugin

[`createOAuthPlugin`](../config/server-options.md#server-api) simplifies wiring
Google and GitHub OAuth flows during development. Configure the required client
credentials and redirect URIs, and the plugin exposes login and callback routes.
State parameters are managed internally to guard against CSRF.

```ts twoslash [vite.config.ts]
import { defineConfig, createOAuthPlugin } from 'vite'

export default defineConfig({
  server: {
    api: {
      plugins: [
        createOAuthPlugin({
          basePath: '/auth',
          providers: {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID!,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
              redirectUri: 'http://localhost:5173/api/auth/google/callback',
            },
            github: {
              clientId: process.env.GITHUB_CLIENT_ID!,
              clientSecret: process.env.GITHUB_CLIENT_SECRET!,
              redirectUri: 'http://localhost:5173/api/auth/github/callback',
            },
          },
        }),
      ],
    },
  },
})
```

Visiting `/api/auth/google` or `/api/auth/github` redirects to the respective
provider. The callback endpoints exchange the authorization code for tokens and
return a JSON payload with both the raw token response and the provider's user
profile. If the environment variables are missing, the plugin responds with an
error describing the missing configuration, making it safe to commit the setup
without secrets.

## Example project

The repository includes a [playground example](https://github.com/vitejs/vite/tree/main/playground/api-auth)
that combines both plugins. It demonstrates JSON credential login, protected
filesystem routes that read the authenticated user, and OAuth starters for
Google and GitHub. Run it locally with `pnpm --filter vite-api-auth-playground dev`.
