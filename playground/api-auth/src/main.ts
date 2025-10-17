const app = document.querySelector<HTMLDivElement>('#app')
if (!app) {
  throw new Error('#app container missing')
}

app.innerHTML = `
  <h1>API Auth Playground</h1>
  <section>
    <h2>JSON credentials</h2>
    <p class="status">Use <code>demo@example.com</code> / <code>demo</code> to sign in.</p>
    <form id="login-form">
      <div class="form-row">
        <label>
          Email
          <input id="email" type="email" value="demo@example.com" required />
        </label>
        <label>
          Password
          <input id="password" type="password" value="demo" required />
        </label>
        <button type="submit">Sign in</button>
      </div>
    </form>
    <div class="form-row">
      <button id="fetch-profile" type="button">Fetch protected profile</button>
      <button id="logout" class="secondary" type="button">Sign out</button>
    </div>
    <div class="message" id="json-message"></div>
    <pre id="session-output">{\n  "token": null,\n  "user": null\n}</pre>
  </section>
  <section>
    <h2>OAuth helpers</h2>
    <p>
      These routes redirect to Google or GitHub when the necessary environment variables
      are configured. If credentials are missing, the OAuth plugin responds with an error
      explaining what is required.
    </p>
    <div class="form-row">
      <a class="button-link google" href="/api/auth/google">Continue with Google</a>
      <a class="button-link github" href="/api/auth/github">Continue with GitHub</a>
    </div>
    <p class="message" id="oauth-message"></p>
  </section>
`

interface SessionState {
  token: string | null
  user: Record<string, unknown> | null
}

const state: SessionState = {
  token: null,
  user: null,
}

const sessionOutput = document.querySelector<HTMLPreElement>('#session-output')
const jsonMessage = document.querySelector<HTMLDivElement>('#json-message')
const oauthMessage = document.querySelector<HTMLParagraphElement>('#oauth-message')
const loginForm = document.querySelector<HTMLFormElement>('#login-form')
const logoutButton = document.querySelector<HTMLButtonElement>('#logout')
const fetchProfileButton = document.querySelector<HTMLButtonElement>('#fetch-profile')

function renderSession() {
  if (sessionOutput) {
    sessionOutput.textContent = JSON.stringify(state, null, 2)
  }
  if (jsonMessage) {
    if (state.user) {
      jsonMessage.textContent = `Signed in as ${state.user['name'] ?? state.user['username']}`
    } else {
      jsonMessage.textContent = 'Not authenticated'
    }
  }
}

renderSession()

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault()
  const email = loginForm.querySelector<HTMLInputElement>('#email')?.value ?? ''
  const password = loginForm.querySelector<HTMLInputElement>('#password')?.value ?? ''

  const response = await callApi('/api/auth/json/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username: email, password }),
  })

  if (!response.ok) {
    state.token = null
    state.user = null
    jsonMessage!.textContent = (await response.json()).error ?? 'Login failed'
    renderSession()
    return
  }

  const payload = await response.json()
  state.token = payload.token ?? null
  state.user = payload.user ?? null
  renderSession()
})

logoutButton?.addEventListener('click', async () => {
  if (!state.token) {
    jsonMessage!.textContent = 'No active session'
    return
  }
  const response = await callApi('/api/auth/json/logout', {
    method: 'POST',
  })
  if (response.status === 204) {
    state.token = null
    state.user = null
    jsonMessage!.textContent = 'Signed out'
    renderSession()
  } else {
    jsonMessage!.textContent = 'Failed to sign out'
  }
})

fetchProfileButton?.addEventListener('click', async () => {
  const response = await callApi('/api/profile')
  if (response.ok) {
    const payload = await response.json()
    jsonMessage!.textContent = `Profile loaded for ${payload.user?.name ?? payload.user?.username}`
  } else {
    const error = await response.json().catch(() => ({}))
    jsonMessage!.textContent = error.error ?? 'Request failed'
  }
})

document.querySelectorAll<HTMLAnchorElement>('a.button-link').forEach((anchor) => {
  anchor.addEventListener('click', (event) => {
    if (!oauthMessage) return
    const provider = anchor.classList.contains('google') ? 'Google' : 'GitHub'
    oauthMessage.textContent = `Redirecting to ${provider}...`
  })
})

function callApi(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (state.token) {
    headers.set('Authorization', `Bearer ${state.token}`)
  }
  return fetch(path, { ...init, headers })
}
