import './style.css'

type LogEntry = { title: string; payload: unknown }

const app = document.querySelector<HTMLDivElement>('#app')!
const logs: LogEntry[] = []

app.innerHTML = `
  <section class="card">
    <p class="eyebrow">Direct API routes</p>
    <h1>Basic Vite API example</h1>
    <p>Call TypeScript files in <code>src/api</code> directly from the browser during development.</p>
    <div class="actions">
      <button id="hello">GET /api/hello</button>
      <button id="echo">POST /api/echo</button>
      <button id="time">GET /api/time</button>
    </div>
    <pre id="output">Click a button to call the local API.</pre>
  </section>
`

const output = document.querySelector<HTMLPreElement>('#output')!

function render() {
  output.textContent = JSON.stringify(logs, null, 2)
}

async function callApi(
  title: string,
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  const response = await fetch(input, init)
  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text()
  logs.unshift({ title: `${title} (${response.status})`, payload })
  render()
}

document
  .querySelector<HTMLButtonElement>('#hello')!
  .addEventListener('click', () => {
    void callApi('GET /api/hello', '/api/hello')
  })

document
  .querySelector<HTMLButtonElement>('#echo')!
  .addEventListener('click', () => {
    void callApi('POST /api/echo', '/api/echo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hello from the frontend',
        at: Date.now(),
      }),
    })
  })

document
  .querySelector<HTMLButtonElement>('#time')!
  .addEventListener('click', () => {
    void callApi('GET /api/time', '/api/time')
  })
