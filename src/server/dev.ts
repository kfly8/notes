// 開発用ライブサーバー。wrangler.jsonc に main がないため本番で Hono が動くことは一度もなく、
// これは dev 専用。本番は Cloudflare Assets が dist/client を丸ごと静的配信するが、dev では
// その代わりに vite build --watch の出力(/assets/*)と global.css を自前で配信する必要がある。
import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { loadManifest, resolveScriptAssets } from '@barefootjs/vite'
import app, { setClientScriptUrl } from './app'

const port = 4321
const OUT_DIR = './dist/client'

const devApp = new Hono()
devApp.get('/global.css', serveStatic({ path: './src/styles/global.css' }))
devApp.use('/assets/*', serveStatic({ root: OUT_DIR }))
// vite build --watch が別プロセスでリビルドするたびに manifest が変わるので、
// リクエストのたびに読み直す。まだ一度もビルドが終わっていない場合は無視して次へ進む。
devApp.use('*', async (_c, next) => {
  try {
    const manifest = await loadManifest(OUT_DIR, true)
    const [scriptUrl] = resolveScriptAssets(manifest, 'src/islands/mount.ts', '/')
    if (scriptUrl) setClientScriptUrl(scriptUrl)
  } catch {}
  await next()
})
devApp.route('/', app)

Bun.serve({
  port,
  fetch: devApp.fetch,
})

console.log(`[notes] dev server running on http://localhost:${port}`)
