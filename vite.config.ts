import devServer from '@hono/vite-dev-server'
import ssg from '@hono/vite-ssg'
import { defineConfig } from 'vite'

const entry = './src/index.tsx'

export default defineConfig(({ command }) => {
  if (command === 'serve') {
    return { plugins: [devServer({ entry })] }
  }
  return { plugins: [ssg({ entry })] }
})
