import type { IncomingMessage } from 'node:http'

export const POST = async (req: IncomingMessage) => {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }

  return {
    received: JSON.parse(Buffer.concat(chunks).toString('utf8')),
    handledBy: 'POST /api/echo',
  }
}
