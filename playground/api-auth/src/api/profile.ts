import type { IncomingMessage, ServerResponse } from 'node:http'

export const GET = (req: IncomingMessage, res: ServerResponse) => {
  const user = (req as Record<string, unknown>).user as
    | Record<string, unknown>
    | undefined
  if (!user) {
    res.statusCode = 401
    return { error: 'Authentication required' }
  }
  return { user }
}
