import { defineMdastPlugin } from 'satteri'
import { escapeHtml } from '../lib/markdown-text'

/**
 * ```mermaid のブロックはシンタックスハイライトではなく mermaid.js に渡す。ローダを
 * 読み込むのは図を含むページだけ（src/islands/mount.ts を参照）。
 *
 * rawHtml は Markdown の HTML ブロックとして埋め込まれ、空行でブロックが終わる。空行が
 * 残ると続きが Markdown として解釈され（`#fff` がタグになるなど）図が壊れるので、
 * mermaid が無視する空行はここで詰めておく。
 */
export const mermaid = defineMdastPlugin({
  name: 'mermaid',
  code(node) {
    if (node.lang !== 'mermaid') return
    return { rawHtml: `<div class="mermaid">${escapeHtml(node.value.replace(/\n\s*\n/g, '\n'))}</div>` }
  },
})
