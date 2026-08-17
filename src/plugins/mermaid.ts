import { defineMdastPlugin } from 'satteri'
import { escapeHtml } from '../lib/markdown-text'

/**
 * ```mermaid のブロックはシンタックスハイライトではなく mermaid.js に渡す。ローダを
 * 読み込むのは図を含むページだけ（Layout.astro を参照）。
 */
export const mermaid = defineMdastPlugin({
  name: 'mermaid',
  code(node) {
    if (node.lang !== 'mermaid') return
    return { rawHtml: `<div class="mermaid">${escapeHtml(node.value)}</div>` }
  },
})
