// ヘッダーの検索アイランドをマウントするエントリスクリプト。CSR Adapter の generate() は
// 常に空出力なので、コンポーネントを登録する副作用 import と実際の render() 呼び出しは
// ここに書く（docs/core/adapters/csr.md の Example を参照）。
import { render } from '@barefootjs/client/runtime'
import { NAVIGATING_ATTR, startRouter } from '@barefootjs/router'
import './Search'

const root = document.getElementById('search-root')
if (root) render(root, 'Search', {})

// bf-region の差し替えでページ遷移を SPA 化する。@barefootjs/router は bare specifier なので
// 素の <script> からは読めず、ここで Vite にバンドルさせる。
startRouter()

// mermaid の描画。Router はインラインの <script> を再実行しないので、ページ内に書くと
// SPA 遷移で来たページで図が描かれない。初回表示と遷移完了（NAVIGATING_ATTR が外れた時）の
// 両方でここから描画する。mermaid.js は重いので、図があるページでだけ CDN から読む。
const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'

const renderMermaid = async () => {
  const nodes = document.querySelectorAll<HTMLElement>('.mermaid:not([data-processed])')
  if (nodes.length === 0) return
  const { default: mermaid } = await import(/* @vite-ignore */ MERMAID_URL)
  const html = document.documentElement
  const dark =
    html.getAttribute('data-theme') === 'dark' ||
    (!html.getAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default', flowchart: { useMaxWidth: false } })
  await mermaid.run({ nodes })
}

renderMermaid()
new MutationObserver(() => {
  if (!document.documentElement.hasAttribute(NAVIGATING_ATTR)) renderMermaid()
}).observe(document.documentElement, { attributes: true, attributeFilter: [NAVIGATING_ATTR] })
