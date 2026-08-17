import { type MdastContent, defineMdastPlugin } from 'satteri'
import {
  HASH_TAG,
  WIKI_LINK,
  escapeHtml,
  normalizeTag,
  notePath,
  tagPath,
} from '../lib/markdown-text'
import { loadNoteTitles } from './note-titles'

type Hit = {
  start: number
  end: number
  node: MdastContent
}

const linkNode = (url: string, text: string, className: string): MdastContent => ({
  type: 'link',
  url,
  children: [{ type: 'text', value: text }],
  data: { hProperties: { class: className } },
})

/**
 * `[[slug]]` と `#tag` は text ノードごとに1回のパスでまとめて解決する。別々に処理すると、
 * 後から動く方が先に処理された結果しか見られなくなるため。
 */
const collectHits = (value: string, titles: Map<string, string>, source: string): Hit[] => {
  const hits: Hit[] = []

  for (const match of value.matchAll(WIKI_LINK)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    const slug = match[1].trim().replace(/\.md$/, '')
    const label = match[2]?.trim()
    const title = titles.get(slug)

    if (title === undefined) {
      console.warn(`[notes] ${source} links to a missing note: [[${slug}]]`)
      hits.push({
        start,
        end,
        node: {
          type: 'html',
          value: `<span class="wikilink broken" title="No note named &quot;${escapeHtml(slug)}&quot;">${escapeHtml(label ?? slug)}</span>`,
        },
      })
      continue
    }

    hits.push({ start, end, node: linkNode(notePath(slug), label ?? title, 'wikilink') })
  }

  for (const match of value.matchAll(HASH_TAG)) {
    // match[1] は `#` をタグの始まりとして認めた直前の文字。テキストとして残す。
    const start = (match.index ?? 0) + match[1].length
    const tag = normalizeTag(match[2])
    hits.push({
      start,
      end: start + match[0].length - match[1].length,
      node: linkNode(tagPath(tag), `#${tag}`, 'tag'),
    })
  }

  return hits.sort((a, b) => a.start - b.start)
}

const buildParts = (
  value: string,
  titles: Map<string, string>,
  source: string
): MdastContent[] | undefined => {
  const hits = collectHits(value, titles, source)
  if (hits.length === 0) return undefined

  const parts: MdastContent[] = []
  let cursor = 0

  for (const hit of hits) {
    if (hit.start < cursor) continue // 重なったマッチ。ウィキリンクの中の `#` など
    if (hit.start > cursor) {
      parts.push({ type: 'text', value: value.slice(cursor, hit.start) })
    }
    parts.push(hit.node)
    cursor = hit.end
  }

  if (cursor < value.length) {
    parts.push({ type: 'text', value: value.slice(cursor) })
  }

  return parts
}

/**
 * `[[slug]]` / `[[slug|表示テキスト]]` を他のノートへのリンクにし（表示は既定でリンク先の
 * タイトル）、`#tag` をタグページへのリンクにする。訪問するのは text ノードだけなので、
 * コードブロックとインラインコードには一切触れない。
 */
export const noteLinks = defineMdastPlugin({
  name: 'note-links',
  text(node, ctx) {
    if (!node.value.includes('[[') && !node.value.includes('#')) return
    const source = ctx.fileURL?.pathname.split('/').pop() ?? '?'
    const parts = buildParts(node.value, loadNoteTitles(), source)
    if (parts === undefined) return
    ctx.insertBefore(node, parts)
    ctx.removeNode(node)
  },
})
