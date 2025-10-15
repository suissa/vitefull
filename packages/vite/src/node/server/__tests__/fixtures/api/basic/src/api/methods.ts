export const GET = () => {
  return { method: 'GET' }
}

export const POST = async () => {
  return Buffer.from('posted', 'utf8')
}
