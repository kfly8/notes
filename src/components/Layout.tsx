import type { FC, PropsWithChildren } from 'hono/jsx'
import { raw } from 'hono/html'
import { site } from '../lib/config'

type LayoutProps = PropsWithChildren<{
  /** リクエストパス（拡張子なし、例: `/some-slug`）。canonical URL・og:type の判定に使う。 */
  path: string
  title?: string
  description?: string
  mermaid?: boolean
  /** このページの Markdown ソースの URL。ノートのページだけが持つ。 */
  markdown?: string
  /** 検索アイランド + Router のマウントスクリプト（Vite manifest から解決した実 URL）。 */
  clientScriptUrl: string
}>

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2f6f5b"/><path d="M9 11h14M9 16h14M9 21h9" stroke="#f8fbf8" stroke-width="2.6" stroke-linecap="round"/></svg>'
)}`

const THEME_INIT = `
try {
  const theme = localStorage.getItem('theme')
  if (theme) document.documentElement.setAttribute('data-theme', theme)
} catch {}
`

const THEME_TOGGLE = `
document.getElementById('toggle-theme').addEventListener('click', () => {
  const root = document.documentElement
  const current =
    root.getAttribute('data-theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  const next = current === 'dark' ? 'light' : 'dark'
  root.setAttribute('data-theme', next)
  try {
    localStorage.setItem('theme', next)
  } catch {}
})
`

const MERMAID_INIT = `
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'
const root = document.documentElement
const dark = root.getAttribute('data-theme') === 'dark' ||
  (!root.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
mermaid.initialize({ startOnLoad: true, theme: dark ? 'dark' : 'default', flowchart: { useMaxWidth: false } })
`

export const Layout: FC<LayoutProps> = ({
  path,
  title,
  description,
  mermaid = false,
  markdown,
  clientScriptUrl,
  children,
}) => {
  const pageTitle = title ? `${title} - ${site.name}` : `${site.name} - ${site.author}`
  const pageDescription = description || site.description
  const canonical = new URL(path, site.origin).href
  const ogImage = new URL('/og-image.png', site.origin).href

  return (
    <>
      {raw('<!doctype html>')}
      <html lang="ja">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{pageTitle}</title>
          <meta name="description" content={pageDescription} />
          <link rel="canonical" href={canonical} />
          <link rel="icon" href={FAVICON} />
          <meta property="og:title" content={pageTitle} />
          <meta property="og:description" content={pageDescription} />
          <meta property="og:site_name" content="notes.kobaken.co" />
          <meta property="og:url" content={canonical} />
          <meta property="og:type" content={path === '/' ? 'website' : 'article'} />
          <meta property="og:image" content={ogImage} />
          <meta property="og:locale" content="ja_JP" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content={pageTitle} />
          <meta name="twitter:description" content={pageDescription} />
          <meta name="twitter:image" content={ogImage} />
          <meta name="twitter:creator" content="@kfly8" />
          <link rel="alternate" type="application/atom+xml" href="/feed.xml" title={site.name} />
          {markdown && <link rel="alternate" type="text/markdown" href={markdown} />}
          <link rel="stylesheet" href="/global.css" />
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        </head>
        <body>
          <header class="site-header">
            <div class="wrap">
              <a class="site-title" href="/">
                {site.name}
              </a>
              <nav class="site-nav">
                <div id="search-root"></div>
                <a href="/tags">tags</a>
                <a href={site.home}>kobaken.co</a>
                <button id="toggle-theme" type="button" aria-label="テーマを切り替える">
                  <span class="theme-light">◐</span>
                  <span class="theme-dark">◑</span>
                </button>
              </nav>
            </div>
          </header>

          <main class="wrap" bf-region>
            {children}
          </main>

          <footer class="site-footer">
            <div class="wrap">
              <a href={site.home}>{site.author}</a> / AI が調べたことの置き場所
            </div>
          </footer>

          <script type="module" src={clientScriptUrl}></script>

          <script dangerouslySetInnerHTML={{ __html: THEME_TOGGLE }} />

          {mermaid && <script type="module" dangerouslySetInnerHTML={{ __html: MERMAID_INIT }} />}
        </body>
      </html>
    </>
  )
}
