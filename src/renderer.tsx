import 'hono'
import { raw } from 'hono/html'
import { jsxRenderer } from 'hono/jsx-renderer'
import { site } from './config'
import { globalStyles } from './styles'

declare module 'hono' {
  interface ContextRenderer {
    (
      content: string | Promise<string>,
      props?: {
        title?: string
        description?: string
        path?: string
        mermaid?: boolean
      }
    ): Response
  }
}

const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}})()`

const themeToggle = `document.getElementById('toggle-theme').addEventListener('click',function(){var r=document.documentElement;var c=r.getAttribute('data-theme')||(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var n=c==='dark'?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('theme',n)}catch(e){}})`

const mermaidInit = `import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
var dark=document.documentElement.getAttribute('data-theme')==='dark'||(!document.documentElement.getAttribute('data-theme')&&window.matchMedia('(prefers-color-scheme: dark)').matches);
mermaid.initialize({startOnLoad:true,theme:dark?'dark':'default',flowchart:{useMaxWidth:false}});`

const favicon = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2f6f5b"/><path d="M9 11h14M9 16h14M9 21h9" stroke="#f8fbf8" stroke-width="2.6" stroke-linecap="round"/></svg>'
)}`

export const renderer = jsxRenderer(
  ({ children, title, description, path, mermaid }) => {
    const pageTitle = title ? `${title} - ${site.name}` : `${site.name} - ${site.author}`
    const pageDescription = description || site.description
    const canonical = `${site.origin}${path ?? '/'}`

    return (
      <html lang="ja">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>{pageTitle}</title>
          <meta name="description" content={pageDescription} />
          <link rel="canonical" href={canonical} />
          <link rel="icon" href={favicon} />
          <meta property="og:title" content={pageTitle} />
          <meta property="og:description" content={pageDescription} />
          <meta property="og:site_name" content={`${site.name}.kobaken.co`} />
          <meta property="og:url" content={canonical} />
          <meta property="og:type" content={path && path !== '/' ? 'article' : 'website'} />
          <meta name="twitter:card" content="summary" />
          <meta name="twitter:creator" content="@kfly8" />
          <link rel="alternate" type="application/atom+xml" href="/feed.xml" title={site.name} />
          <style>{raw(globalStyles)}</style>
          <script>{raw(themeInit)}</script>
        </head>
        <body>
          <header class="site-header">
            <div class="wrap">
              <a class="site-title" href="/">
                {site.name}
              </a>
              <nav class="site-nav">
                <a href="/tags/">tags</a>
                <a href={site.home}>kobaken.co</a>
                <button id="toggle-theme" type="button" aria-label="テーマを切り替える">
                  <span class="theme-light">◐</span>
                  <span class="theme-dark">◑</span>
                </button>
              </nav>
            </div>
          </header>
          <main class="wrap">{children}</main>
          <footer class="site-footer">
            <div class="wrap">
              <a href={site.home}>{site.author}</a> / 調べたことの置き場所
            </div>
          </footer>
          <script>{raw(themeToggle)}</script>
          {mermaid ? <script type="module">{raw(mermaidInit)}</script> : null}
        </body>
      </html>
    )
  },
  { docType: true }
)
