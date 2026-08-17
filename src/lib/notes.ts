import matter from 'gray-matter'
import { normalizeTag, renderMarkdown, type NoteRef } from './markdown'

export type Note = {
  slug: string
  title: string
  created: string
  updated: string
  tags: string[]
  html: string
  /** Slugs this note links to. */
  links: string[]
  /** Notes that link here. */
  backlinks: NoteRef[]
  hasMermaid: boolean
  /** Plain-text opening, used on index pages. */
  excerpt: string
}

const sources = import.meta.glob('../../notes/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const toDateString = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'string') return value.trim().slice(0, 10)
  return ''
}

const toTagList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((tag) => normalizeTag(String(tag)))
  if (typeof value === 'string') {
    return value
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((tag) => normalizeTag(tag.replace(/^#/, '')))
  }
  return []
}

/** Strip the leading `# Title` line and use it as the note title. */
const splitTitle = (body: string, fallback: string): { title: string; rest: string } => {
  const match = /^\s*#\s+(.+?)[ \t]*(?:\n|$)/.exec(body)
  if (!match) return { title: fallback, rest: body }
  return { title: match[1].trim(), rest: body.slice(match[0].length) }
}

const decodeEntities = (text: string): string =>
  text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

/** Take the opening paragraph of the rendered note as a plain-text summary. */
const toExcerpt = (html: string, length = 120): string => {
  const paragraph = /<p>([\s\S]*?)<\/p>/.exec(html)
  const text = decodeEntities((paragraph?.[1] ?? html).replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > length ? `${text.slice(0, length)}…` : text
}

type Parsed = {
  slug: string
  title: string
  body: string
  created: string
  updated: string
  frontmatterTags: string[]
}

const parsed: Parsed[] = Object.entries(sources).map(([path, source]) => {
  const slug = path.replace(/^.*\//, '').replace(/\.md$/, '')
  const { data, content } = matter(source)
  const { title, rest } = splitTitle(content, typeof data.title === 'string' ? data.title : slug)
  return {
    slug,
    title,
    body: rest,
    created: toDateString(data.created),
    updated: toDateString(data.updated) || toDateString(data.created),
    frontmatterTags: toTagList(data.tags),
  }
})

const refs = new Map<string, NoteRef>(
  parsed.map((note) => [note.slug, { slug: note.slug, title: note.title }])
)

const resolve = (target: string): NoteRef | undefined =>
  refs.get(target) ?? refs.get(target.replace(/\.md$/, ''))

const rendered = await Promise.all(
  parsed.map(async (note) => {
    const result = await renderMarkdown(note.body, { resolve })
    for (const target of result.brokenLinks) {
      console.warn(`[notes] ${note.slug}.md links to a missing note: [[${target}]]`)
    }
    const tags = [...new Set([...note.frontmatterTags, ...result.tags])]
    return {
      ...note,
      tags,
      html: result.html,
      links: result.links,
      hasMermaid: result.hasMermaid,
      excerpt: toExcerpt(result.html),
      backlinks: [] as NoteRef[],
    } satisfies Note
  })
)

for (const note of rendered) {
  for (const target of note.links) {
    const linked = rendered.find((candidate) => candidate.slug === target)
    if (linked && !linked.backlinks.some((ref) => ref.slug === note.slug)) {
      linked.backlinks.push({ slug: note.slug, title: note.title })
    }
  }
}

const byRecency = (a: Note, b: Note): number => {
  const left = b.updated.localeCompare(a.updated)
  return left !== 0 ? left : a.slug.localeCompare(b.slug)
}

export const notes: Note[] = [...rendered].sort(byRecency)

export const noteBySlug = new Map<string, Note>(notes.map((note) => [note.slug, note]))

export type TagSummary = {
  tag: string
  notes: Note[]
}

const tagMap = new Map<string, Note[]>()
for (const note of notes) {
  for (const tag of note.tags) {
    const list = tagMap.get(tag)
    if (list) list.push(note)
    else tagMap.set(tag, [note])
  }
}

export const tags: TagSummary[] = [...tagMap.entries()]
  .map(([tag, list]) => ({ tag, notes: [...list].sort(byRecency) }))
  .sort((a, b) => b.notes.length - a.notes.length || a.tag.localeCompare(b.tag))

export const tagByName = new Map<string, TagSummary>(tags.map((entry) => [entry.tag, entry]))
