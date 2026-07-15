# Vite direct API examples

This folder contains ready-to-run examples for Vite's direct dev-server API routes. They demonstrate how frontend code can call local API handlers without creating or running a separate backend server.

> These examples are designed for development. The API route middleware is part of the Vite dev server and is not a production backend replacement.

## Examples

### `api-basic`

A minimal example with file-based API routes in `src/api`.

What it shows:

- `GET /api/hello` returning a plain object as JSON.
- `POST /api/echo` reading the Node request body and returning it.
- `GET /api/time` returning a Web `Response` object.

Run it:

```bash
pnpm --filter vite-example-api-basic dev
```

Open the printed local URL and click the buttons to call the routes.

### `api-plugins`

A request-level plugin example configured through `server.api.plugins` in `vite.config.ts`.

What it shows:

- A plugin that sets a response header before route handlers run.
- A plugin that short-circuits `GET /api/health` without a filesystem route.
- A normal filesystem route at `GET /api/report` that reads a value attached to `req` by a plugin.

Run it:

```bash
pnpm --filter vite-example-api-plugins dev
```

### `api-json-auth`

A complete login/profile/logout flow using the built-in `createJsonAuthPlugin` helper.

What it shows:

- `POST /api/auth/json/login` issues an in-memory bearer token.
- `GET /api/profile` is protected by the auth plugin.
- `POST /api/auth/json/logout` revokes the current token.
- The frontend stores the token in `localStorage` and sends it in the `Authorization` header.

Demo credentials:

- Username: `demo`
- Password: `demo`

Run it:

```bash
pnpm --filter vite-example-api-json-auth dev
```

## How the examples are structured

Each example follows the same layout:

```text
examples/<example-name>/
├─ index.html
├─ package.json
├─ vite.config.ts        # only when custom API config is needed
└─ src/
   ├─ main.ts            # frontend code that calls /api/*
   ├─ style.css
   └─ api/               # direct API route modules
```

By default, Vite maps requests beginning with `/api` to files under `src/api`. For example, `src/api/hello.ts` handles `/api/hello`.
