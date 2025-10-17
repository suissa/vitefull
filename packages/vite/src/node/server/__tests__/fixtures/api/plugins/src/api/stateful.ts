import type { IncomingMessage, ServerResponse } from 'node:http'

export const GET = (req: IncomingMessage, _res: ServerResponse) => ({
  message: (req as Record<string, unknown>).pluginMessage ?? 'missing',
  handledBy: 'module',
})
