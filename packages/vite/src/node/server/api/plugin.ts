import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ViteDevServer } from '../index'

export interface ApiRequestContext {
  /**
   * The dev server instance handling the request.
   */
  server: ViteDevServer
  /**
   * Node.js request object.
   */
  req: IncomingMessage
  /**
   * Node.js response object.
   */
  res: ServerResponse
  /**
   * Raw request URL (including query string) provided by Node.js.
   */
  url: string
  /**
   * HTTP method in uppercase form.
   */
  method: string
  /**
   * Configured API prefix (e.g. `/api`).
   */
  prefix: string
  /**
   * Decoded pathname for the request.
   */
  pathname: string
  /**
   * Normalized route relative to the API directory (e.g. `/users`).
   */
  route: string
  /**
   * Mutable bag that plugins can use to pass data to other plugins or route handlers.
   */
  state: Record<string, unknown>
  /**
   * Flag that plugins can set to true to indicate the request has been fully handled.
   */
  handled: boolean
}

export interface ApiPlugin {
  name: string
  handle?(context: ApiRequestContext): Awaitable<unknown>
}

export type Awaitable<T> = T | Promise<T>
