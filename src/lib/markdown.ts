import { Marked, type Tokens, type TokenizerAndRendererExtension } from 'marked'
import { bundledLanguages, codeToHtml } from 'shiki'

export type NoteRef = {
  slug: string
  title: string
}

export type RenderContext = {
  /** Resolve a wiki link target (a slug) to an existing note. */
  resolve: (slug: string) => NoteRef | undefined
}

export type RenderResult = {
  html: string
  /** Slugs this note links to, in order of first appearance. */
  links: string[]
  /** Tags found in the body. */
  tags: string[]
  /** Wiki link targets that did not resolve to a note. */
  brokenLinks: string[]
  hasMermaid: boolean
}

const SHIKI_THEMES = { light: 'github-light', dark: 'github-dark' } as const

/**
 * Tags start with a letter (Latin or Japanese) and may contain letters, digits,
 * underscores and hyphens. Latin tags are lowercased so `#AI` and `#ai` are the
 * same tag; Japanese tags are left as-is.
 */
const TAG_BODY = /^#([\p{L}][\p{L}\p{N}_-]*)/u

/**
 * A `#` only starts a tag when it is not glued to a preceding word character,
 * so `C#`, `foo#bar` and URL fragments are left alone.
 */
const TAG_START = /(?:^|[^\p{L}\p{N}_])#[\p{L}]/u

const WIKI_LINK = /^\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/

export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export const normalizeTag = (tag: string): string =>
  /^[A-Za-z0-9_-]+$/.test(tag) ? tag.toLowerCase() : tag

export const tagPath = (tag: string): string => `/tags/${encodeURIComponent(tag)}`

export const notePath = (slug: string): string => `/${slug}`

const headingId = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')

const highlight = async (code: string, lang: string): Promise<string> => {
  const known = lang && lang in bundledLanguages
  return codeToHtml(code, {
    lang: known ? lang : 'text',
    themes: SHIKI_THEMES,
    defaultColor: false,
  })
}

type CodeToken = Tokens.Code & { rendered?: string }

export const renderMarkdown = async (
  source: string,
  ctx: RenderContext
): Promise<RenderResult> => {
  const links: string[] = []
  const tags: string[] = []
  const brokenLinks: string[] = []
  let hasMermaid = false

  const wikiLink: TokenizerAndRendererExtension = {
    name: 'wikiLink',
    level: 'inline',
    start(src) {
      const index = src.indexOf('[[')
      return index === -1 ? undefined : index
    },
    tokenizer(src) {
      const match = WIKI_LINK.exec(src)
      if (!match) return undefined
      return {
        type: 'wikiLink',
        raw: match[0],
        target: match[1].trim(),
        label: match[2]?.trim(),
      }
    },
    renderer(token) {
      const { target, label } = token as unknown as { target: string; label?: string }
      const ref = ctx.resolve(target)
      if (!ref) {
        if (!brokenLinks.includes(target)) brokenLinks.push(target)
        return `<span class="wikilink broken" title="No note named &quot;${escapeHtml(target)}&quot;">${escapeHtml(label ?? target)}</span>`
      }
      if (!links.includes(ref.slug)) links.push(ref.slug)
      return `<a class="wikilink" href="${notePath(ref.slug)}">${escapeHtml(label ?? ref.title)}</a>`
    },
  }

  const hashTag: TokenizerAndRendererExtension = {
    name: 'hashTag',
    level: 'inline',
    start(src) {
      const match = TAG_START.exec(src)
      if (!match) return undefined
      return match.index + (match[0].startsWith('#') ? 0 : 1)
    },
    tokenizer(src) {
      const match = TAG_BODY.exec(src)
      if (!match) return undefined
      return { type: 'hashTag', raw: match[0], tag: normalizeTag(match[1]) }
    },
    renderer(token) {
      const { tag } = token as unknown as { tag: string }
      if (!tags.includes(tag)) tags.push(tag)
      return `<a class="tag" href="${tagPath(tag)}">#${escapeHtml(tag)}</a>`
    },
  }

  const marked = new Marked({ gfm: true })

  marked.use({
    async: true,
    extensions: [wikiLink, hashTag],
    walkTokens: async (token) => {
      if (token.type !== 'code') return
      const code = token as CodeToken
      const lang = (code.lang ?? '').trim().split(/\s+/)[0] ?? ''
      if (lang === 'mermaid') {
        hasMermaid = true
        code.rendered = `<div class="mermaid">${escapeHtml(code.text)}</div>`
        return
      }
      code.rendered = await highlight(code.text, lang)
    },
    renderer: {
      code(token) {
        const code = token as CodeToken
        return code.rendered ?? `<pre><code>${escapeHtml(code.text)}</code></pre>`
      },
      heading(token) {
        const content = this.parser.parseInline(token.tokens)
        const id = headingId(token.text)
        return `<h${token.depth} id="${id}">${content}</h${token.depth}>\n`
      },
      link(token) {
        const href = escapeHtml(token.href)
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : ''
        const content = this.parser.parseInline(token.tokens)
        const external = /^https?:\/\//.test(token.href)
        const rel = external ? ' target="_blank" rel="noopener noreferrer"' : ''
        return `<a href="${href}"${title}${rel}>${content}</a>`
      },
    },
  })

  const html = await marked.parse(source)

  return { html, links, tags, brokenLinks, hasMermaid }
}
