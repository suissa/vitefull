import type { IncomingMessage } from 'node:http'

export default function pluginState(req: IncomingMessage) {
  return { user: (req as IncomingMessage & { user?: unknown }).user }
}
