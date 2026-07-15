import { createJsonAuthPlugin, defineConfig } from 'vite'

export default defineConfig({
  server: {
    api: {
      plugins: [
        createJsonAuthPlugin({
          users: {
            demo: {
              password: 'demo',
              profile: {
                name: 'Demo User',
                role: 'admin',
              },
            },
          },
          publicRoutes: ['/auth/json/login'],
        }),
      ],
    },
  },
})
