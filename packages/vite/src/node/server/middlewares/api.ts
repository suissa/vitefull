import path from 'node:path'
import { promises as fs } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect } from '#dep-types/connect'
import type { ViteDevServer } from '../../server'
import type { ApiPlugin, ApiRequestContext } from '../api/plugin'
import { isObject, normalizePath } from '../../utils'

const API_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.cts',
]

const KNOWN_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
]

export function apiMiddleware(server: ViteDevServer): Connect.NextHandleFunction {
  const config = server.config.server.api
  if (!config) {
    return (_req, _res, next) => next()
  }

  const apiPrefix = config.prefix
  const apiDirectory = config.dir
  const plugins = config.plugins ?? []

  return async function viteApiMiddleware(req, res, next) {
    try {
      const url = req.url
      if (!url || !req.method) {
        return next()
      }

      const pathname = decodePathname(url)
      if (!pathname || !pathname.startsWith(apiPrefix)) {
        return next()
      }

      const routePath = normalizeRoute(pathname.slice(apiPrefix.length))

      const context: ApiRequestContext = {
        server,
        req,
        res,
        url,
        method: req.method.toUpperCase(),
        prefix: apiPrefix,
        pathname,
        route: routePath,
        state: Object.create(null),
        handled: false,
      }

      const pluginResult = await runPlugins(plugins, context)
      if (res.writableEnded) {
        return
      }
      if (pluginResult !== undefined) {
        await sendHandlerResult(res, pluginResult)
        return
      }
      if (context.handled) {
        return
      }

      const file = await resolveApiFile(apiDirectory, routePath)
      if (!file) {
        return next()
      }

      const moduleId = toModuleId(server, file)
      const mod = await server.ssrLoadModule(moduleId)

      const handler = resolveHandler(mod, context.method)

      if (!handler) {
        sendMethodNotAllowed(res, mod)
        return
      }

      const result = await handler(req, res)
      if (res.writableEnded) {
        return
      }

      await sendHandlerResult(res, result)
    } catch (error) {
      next(error as Error)
    }
  }
}

async function runPlugins(plugins: ApiPlugin[], context: ApiRequestContext) {
  for (const plugin of plugins) {
    if (!plugin.handle) {
      continue
    }
    const result = await plugin.handle(context)
    if (context.res.writableEnded) {
      return undefined
    }
    if (result !== undefined) {
      return result
    }
    if (context.handled) {
      return undefined
    }
  }
  return undefined
}

function decodePathname(url: string): string | null {
  const pathname = url.split('?')[0]
  try {
    return decodeURI(pathname)
  } catch {
    return null
  }
}

function normalizeRoute(route: string): string {
  if (!route || route === '/') {
    return '/'
  }
  return route.startsWith('/') ? route : `/${route}`
}

async function resolveApiFile(apiDir: string, route: string): Promise<string | null> {
  const segments = route.split('/').filter(Boolean)
  const basePath = path.join(apiDir, ...segments)
  const candidates: string[] = []

  if (segments.length === 0) {
    for (const ext of API_EXTENSIONS) {
      candidates.push(path.join(apiDir, `index${ext}`))
    }
  } else {
    for (const ext of API_EXTENSIONS) {
      candidates.push(`${basePath}${ext}`)
    }
    for (const ext of API_EXTENSIONS) {
      candidates.push(path.join(basePath, `index${ext}`))
    }
  }

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate)
      if (stat.isFile()) {
        return normalizePath(candidate)
      }
    } catch {
      continue
    }
  }

  return null
}

function toModuleId(server: ViteDevServer, file: string): string {
  const relative = path.relative(server.config.root, file)
  return `/${normalizePath(relative)}`
}

type ApiModule = Record<string, unknown>

type ApiHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => unknown | Promise<unknown>

function resolveHandler(mod: ApiModule, method: string): ApiHandler | undefined {
  const methodExport = mod[method]
  if (typeof methodExport === 'function') {
    return methodExport as ApiHandler
  }
  if (typeof mod.default === 'function') {
    return mod.default as ApiHandler
  }
  return undefined
}

function sendMethodNotAllowed(res: ServerResponse, mod: ApiModule): void {
  if (res.headersSent || res.writableEnded) {
    return
  }
  const allow = KNOWN_METHODS.filter((method) => typeof mod[method] === 'function')
  if (allow.length > 0) {
    res.setHeader('Allow', allow.join(', '))
  }
  res.statusCode = 405
  res.end('Method Not Allowed')
}

async function sendHandlerResult(res: ServerResponse, result: unknown): Promise<void> {
  if (res.headersSent || res.writableEnded) {
    return
  }

  if (isResponseLike(result)) {
    await sendWebResponse(res, result)
    return
  }

  if (result === undefined) {
    res.end()
    return
  }

  if (Buffer.isBuffer(result)) {
    res.end(result)
    return
  }

  if (typeof result === 'string') {
    res.end(result)
    return
  }

  if (isObject(result)) {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
    }
    res.end(JSON.stringify(result))
    return
  }

  res.end(String(result))
}

type ResponseLike = {
  status: number
  headers?: { forEach: (callback: (value: string, key: string) => void) => void }
  arrayBuffer: () => Promise<ArrayBuffer>
}

function isResponseLike(value: unknown): value is ResponseLike {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Partial<ResponseLike>
  return (
    typeof candidate.status === 'number' &&
    typeof candidate.arrayBuffer === 'function' &&
    candidate.headers !== undefined &&
    typeof candidate.headers.forEach === 'function'
  )
}

async function sendWebResponse(res: ServerResponse, response: ResponseLike): Promise<void> {
  res.statusCode = response.status
  response.headers?.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      const existing = res.getHeader(key)
      if (existing) {
        const values = Array.isArray(existing) ? existing : [existing as string]
        res.setHeader(key, [...values, value])
        return
      }
    }
    res.setHeader(key, value)
  })

  if (res.req?.method === 'HEAD') {
    res.end()
    return
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  res.end(buffer)
}
