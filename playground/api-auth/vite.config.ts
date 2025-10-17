import { defineConfig, createJsonAuthPlugin, createOAuthPlugin } from 'vite'
import type { OAuthProviderOptions } from 'vite'

function providerFromEnv(
  provider: 'GOOGLE' | 'GITHUB',
  fallbackRedirect: string,
): OAuthProviderOptions | undefined {
  const clientId = process.env[`${provider}_CLIENT_ID`]
  const clientSecret = process.env[`${provider}_CLIENT_SECRET`]
  const redirectUri =
    process.env[`${provider}_REDIRECT_URI`] ?? `http://localhost:5173${fallbackRedirect}`

  if (!clientId || !clientSecret) {
    return undefined
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
  }
}

const google = providerFromEnv('GOOGLE', '/api/auth/google/callback')
const github = providerFromEnv('GITHUB', '/api/auth/github/callback')

export default defineConfig({
  server: {
    api: {
      plugins: [
        createJsonAuthPlugin({
          users: {
            'demo@example.com': {
              password: 'demo',
              profile: { name: 'Demo User', role: 'demo' },
            },
          },
          publicRoutes: [
            '/',
            '/public',
            '/auth/json/login',
            '/auth/google',
            '/auth/google/callback',
            '/auth/github',
            '/auth/github/callback',
          ],
        }),
        createOAuthPlugin({
          basePath: '/auth',
          providers: {
            google,
            github,
          },
        }),
      ],
    },
  },
})
