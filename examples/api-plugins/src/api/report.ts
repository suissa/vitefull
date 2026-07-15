import type { IncomingMessage } from 'node:http'

type TimedRequest = IncomingMessage & {
  apiStartedAt?: number
}

export const GET = (req: TimedRequest) => {
  return {
    message: 'This route was loaded from src/api/report.ts',
    note: 'The x-api-plugin header and apiStartedAt value were set before this handler ran.',
    apiStartedAt: req.apiStartedAt,
    url: req.url,
  }
}
