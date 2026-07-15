import type { IncomingMessage } from 'node:http'

type AuthenticatedRequest = IncomingMessage & {
  user?: unknown
}

export const GET = (req: AuthenticatedRequest) => {
  return {
    message: 'Only authenticated requests can read this profile.',
    user: req.user,
  }
}
