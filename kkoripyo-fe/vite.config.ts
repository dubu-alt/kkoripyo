import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { z } from 'zod'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const result = z
    .object({
      VITE_API_ORIGIN: z.url({ protocol: /^https?$/ }).refine((value) => {
        try {
          const url = new URL(value)
          return (
            url.pathname === '/' &&
            !url.search &&
            !url.hash &&
            !url.username &&
            !url.password
          )
        } catch {
          return false
        }
      }),
    })
    .safeParse(loadEnv(mode, process.cwd(), 'VITE_'))

  if (!result.success) {
    throw new Error(
      'VITE_API_ORIGIN must be an HTTP(S) origin without a path, query, credentials, or fragment. Set it in .env.local or pass it as a Docker build argument.',
    )
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 3000,
      strictPort: true,
    },
    preview: {
      port: 3000,
      strictPort: true,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
