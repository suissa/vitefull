import type { IncomingMessage } from 'node:http'

export const GET = (req: IncomingMessage) => {
  return { user: (req as IncomingMessage & { user?: unknown }).user }
}
