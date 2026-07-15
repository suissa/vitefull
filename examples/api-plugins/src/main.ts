import './style.css'

const app = document.querySelector<HTMLDivElement>('#app')!

app.innerHTML = `
  <section class="card">
    <p class="eyebrow">server.api.plugins</p>
    <h1>Plugin-powered API routes</h1>
    <p>Plugins can short-circuit a response, add headers, and pass state to file handlers.</p>
    <div class="actions">
      <button data-url="/api/health">Plugin response</button>
      <button data-url="/api/report">Filesystem route with plugin state</button>
    </div>
    <pre id="output">Try an API call.</pre>
  </section>
`

const output = document.querySelector<HTMLPreElement>('#output')!

async function call(url: string) {
  const response = await fetch(url)
  const payload = await response.json()
  output.textContent = JSON.stringify(
    {
      status: response.status,
      pluginHeader: response.headers.get('x-api-plugin'),
      payload,
    },
    null,
    2,
  )
}

document
  .querySelectorAll<HTMLButtonElement>('button[data-url]')
  .forEach((button) => {
    button.addEventListener('click', () => {
      void call(button.dataset.url!)
    })
  })
