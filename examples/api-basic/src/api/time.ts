export const GET = () => {
  return Response.json({ now: new Date().toISOString() })
}
