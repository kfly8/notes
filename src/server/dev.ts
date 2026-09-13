// 開発用ライブサーバー。app.fetch をそのまま Bun.serve に渡すだけ。wrangler.jsonc に main が
// ないため本番で Hono が動くことは一度もなく、これは dev 専用。
import app from './app'

const port = 4321

Bun.serve({
  port,
  fetch: app.fetch,
})

console.log(`[notes] dev server running on http://localhost:${port}`)
