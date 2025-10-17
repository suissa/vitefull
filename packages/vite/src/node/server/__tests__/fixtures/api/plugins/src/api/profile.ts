import type { IncomingMessage, ServerResponse } from 'node:http'

export const GET = (req: IncomingMessage, res: ServerResponse) => {
  const user = (req as Record<string, unknown>).user
  if (!user) {
    res.statusCode = 401
    return { error: 'Unauthorized' }
  }
  return { user }
}
