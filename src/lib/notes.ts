import { type CollectionEntry, getCollection } from 'astro:content'
import {
  excerpt,
  extractTags,
  extractTitle,
  extractWikiLinks,
  hasMermaid,
  normalizeTag,
  summary,
} from './markdown-text'

export type NoteEntry = CollectionEntry<'notes'>

export type NoteRef = {
  slug: string
  title: string
}

export type Note = NoteRef & {
  created: string
  updated: string
  tags: string[]
  /** このノートがリンクしている slug。 */
  links: string[]
  /** このノートにリンクしているノート。 */
  backlinks: NoteRef[]
  excerpt: string
  hasMermaid: boolean
  entry: NoteEntry

  // 以下は OKF frontmatter 用（`/<slug>.md`）。
  /** 概念の種類。既定は Note。 */
  type: string
  /** 1文の要約。 */
  description: string
}

export type TagSummary = {
  tag: string
  notes: Note[]
}

const toDateString = (value: Date | undefined): string =>
  value ? value.toISOString().slice(0, 10) : ''

const byRecency = (a: Note, b: Note): number =>
  b.updated.localeCompare(a.updated) || a.slug.localeCompare(b.slug)

export const loadNotes = async (): Promise<{
  notes: Note[]
  bySlug: Map<string, Note>
  tags: TagSummary[]
  byTag: Map<string, TagSummary>
}> => {
  const entries = await getCollection('notes')

  // 先にタイトルを集める。抜粋では `[[slug]]` をリンク先のタイトルとして表示するため。
  const titles = new Map(
    entries.map((entry) => [entry.id, extractTitle(entry.body ?? '') ?? entry.id])
  )

  const notes: Note[] = entries.map((entry) => {
    const body = entry.body ?? ''
    const created = toDateString(entry.data.created)
    const frontmatterTags = (entry.data.tags ?? []).map((tag) =>
      normalizeTag(tag.replace(/^#/, ''))
    )
    return {
      slug: entry.id,
      title: titles.get(entry.id) ?? entry.id,
      created,
      updated: toDateString(entry.data.updated) || created,
      tags: [...new Set([...frontmatterTags, ...extractTags(body)])],
      links: extractWikiLinks(body),
      backlinks: [],
      excerpt: excerpt(body, titles),
      hasMermaid: hasMermaid(body),
      entry,
      type: entry.data.type ?? 'Note',
      description: entry.data.description ?? summary(body, titles),
    }
  })

  const bySlug = new Map(notes.map((note) => [note.slug, note]))

  for (const note of notes) {
    for (const target of note.links) {
      const linked = bySlug.get(target)
      if (linked && !linked.backlinks.some((ref) => ref.slug === note.slug)) {
        linked.backlinks.push({ slug: note.slug, title: note.title })
      }
    }
  }

  notes.sort(byRecency)

  const tagMap = new Map<string, Note[]>()
  for (const note of notes) {
    for (const tag of note.tags) {
      const list = tagMap.get(tag)
      if (list) list.push(note)
      else tagMap.set(tag, [note])
    }
  }

  const tags: TagSummary[] = [...tagMap.entries()]
    .map(([tag, list]) => ({ tag, notes: [...list].sort(byRecency) }))
    .sort((a, b) => b.notes.length - a.notes.length || a.tag.localeCompare(b.tag))

  return { notes, bySlug, tags, byTag: new Map(tags.map((entry) => [entry.tag, entry])) }
}
