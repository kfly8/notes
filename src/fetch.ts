import { actions, middleware, pages, redirects, sessions, trailingSlash } from 'astro/hono'
import { Hono } from 'hono'

// Astro の Hono アダプタ。このサイトは全ページ prerender されるので、静的アセットは
// Cloudflare が直接返し、このパイプラインが扱うのは残りだけ（リダイレクトと、将来
// prerender しないルートを足したときの受け皿）。
const app = new Hono()

app.use(trailingSlash())
app.use(redirects())
app.use(sessions())
app.use(actions())
app.use(middleware())
app.use(pages())

export default app
