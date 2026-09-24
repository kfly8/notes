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
  // テーマを切り替えたときに描き直せるよう、SVG に置き換わる前のソースを取っておく。
  for (const node of nodes) node.dataset.src ??= node.textContent ?? ''
  const { default: mermaid } = await import(/* @vite-ignore */ MERMAID_URL)
  // 図の色はサイトの配色トークンから取る。mermaid の組み込みテーマ（default / dark）は
  // サイトの配色と合わず、ノードやラベルの背景が浮いて見えるため。
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => style.getPropertyValue(name).trim()
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    fontFamily: getComputedStyle(document.body).fontFamily,
    themeVariables: {
      background: token('--bg'),
      mainBkg: token('--surface'),
      primaryColor: token('--surface'),
      primaryTextColor: token('--fg'),
      primaryBorderColor: token('--fg-faint'),
      lineColor: token('--fg-faint'),
      textColor: token('--fg-sub'),
      edgeLabelBackground: token('--bg'),
      clusterBkg: 'transparent',
      clusterBorder: token('--border'),
      noteBkgColor: token('--surface'),
      noteBorderColor: token('--fg-faint'),
      noteTextColor: token('--fg'),
    },
    flowchart: { useMaxWidth: false },
  })
  await mermaid.run({ nodes })
}

// 描画は非同期なので、遷移とテーマ切り替えが重なっても順番に処理する。
let queue = Promise.resolve()
const scheduleRender = () => {
  queue = queue.then(renderMermaid).catch(console.error)
}

// 配色トークンを描画時に SVG へ焼き込むので、テーマが変わったらソースに戻して描き直す。
const rerenderMermaid = () => {
  for (const node of document.querySelectorAll<HTMLElement>('.mermaid[data-src]')) {
    node.textContent = node.dataset.src ?? ''
    node.removeAttribute('data-processed')
  }
  scheduleRender()
}

scheduleRender()
new MutationObserver((records) => {
  if (records.some((r) => r.attributeName === 'data-theme')) rerenderMermaid()
  else if (!document.documentElement.hasAttribute(NAVIGATING_ATTR)) scheduleRender()
}).observe(document.documentElement, { attributes: true, attributeFilter: [NAVIGATING_ATTR, 'data-theme'] })
// OS の設定でライト/ダークが変わった場合（data-theme が未設定のとき）も描き直す。
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', rerenderMermaid)
