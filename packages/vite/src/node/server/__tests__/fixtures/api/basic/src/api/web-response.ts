function createResponse(method: string) {
  const body = method === 'HEAD' ? 'head-body' : 'web-response'
  const response = new Response(body, {
    status: 201,
    headers: {
      'x-handler': method,
    },
  })
  response.headers.append('set-cookie', 'a=1; Path=/')
  response.headers.append('set-cookie', 'b=2; Path=/')
  return response
}

export const GET = () => createResponse('GET')

export const HEAD = () => createResponse('HEAD')
