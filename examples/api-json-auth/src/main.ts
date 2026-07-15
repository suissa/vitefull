import './style.css'

let token: string | null = localStorage.getItem('api-json-auth-token')

const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  <section class="card">
    <p class="eyebrow">JSON auth</p>
    <h1>Protected direct API route</h1>
    <p>Use <code>demo</code> / <code>demo</code> to receive a bearer token and call <code>/api/profile</code>.</p>
    <form id="login-form" class="login-form">
      <input id="username" value="demo" aria-label="Username" />
      <input id="password" value="demo" aria-label="Password" type="password" />
      <button>Login</button>
    </form>
    <div class="actions">
      <button id="profile">GET /api/profile</button>
      <button id="logout">Logout</button>
    </div>
    <pre id="output">Token loaded: ${token ? 'yes' : 'no'}</pre>
  </section>
`

const output = document.querySelector<HTMLPreElement>('#output')!

function show(value: unknown) {
  output.textContent = JSON.stringify(value, null, 2)
}

async function read(response: Response) {
  if (response.status === 204) return null
  const contentType = response.headers.get('content-type') ?? ''
  return contentType.includes('application/json')
    ? response.json()
    : response.text()
}

document
  .querySelector<HTMLFormElement>('#login-form')!
  .addEventListener('submit', (event) => {
    event.preventDefault()
    const username =
      document.querySelector<HTMLInputElement>('#username')!.value
    const password =
      document.querySelector<HTMLInputElement>('#password')!.value
    void fetch('/api/auth/json/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    }).then(async (response) => {
      const payload = await read(response)
      if (
        response.ok &&
        payload &&
        typeof payload === 'object' &&
        'token' in payload
      ) {
        token = String(payload.token)
        localStorage.setItem('api-json-auth-token', token)
      }
      show({ status: response.status, payload })
    })
  })

document
  .querySelector<HTMLButtonElement>('#profile')!
  .addEventListener('click', () => {
    void fetch('/api/profile', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (response) => {
      show({ status: response.status, payload: await read(response) })
    })
  })

document
  .querySelector<HTMLButtonElement>('#logout')!
  .addEventListener('click', () => {
    void fetch('/api/auth/json/logout', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (response) => {
      localStorage.removeItem('api-json-auth-token')
      token = null
      show({ status: response.status, payload: await read(response) })
    })
  })
