import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter, parseYamlScalar, parseYamlStringArray } from '../lib/frontmatter-yaml'
import {
  excerpt,
  extractTags,
  extractTitle,
  extractWikiLinks,
  hasMermaid,
  normalizeTag,
  summary,
} from '../lib/markdown-text'

const NOTES_DIR = join(process.cwd(), 'notes')
const REQUIRED_KEYS = ['created', 'updated', 'title', 'description', 'tags'] as const

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
  body: string

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

const byRecency = (a: Note, b: Note): number =>
  b.updated.localeCompare(a.updated) || a.slug.localeCompare(b.slug)

type RawEntry = {
  slug: string
  body: string
  created: string
  updated: string
  title?: string
  description?: string
  tags: string[]
  type?: string
}

/**
 * pre-commit フック（scripts/sync-notes-frontmatter.ts）が本文から導出して書き込む frontmatter を
 * 読み取る。旧 astro:content の zod スキーマが必須項目としていたのと同じ安全網として、
 * created/updated/title/description/tags の欠落をここでビルド失敗にする。
 */
const readEntry = (file: string): RawEntry => {
  const slug = file.slice(0, -'.md'.length)
  const source = readFileSync(join(NOTES_DIR, file), 'utf8')
  const parsed = parseFrontmatter(source)
  if (!parsed) {
    throw new Error(`[notes] ${file}: frontmatter がありません（bun run notes:sync:all で埋めてください）`)
  }
  const { fields, body } = parsed

  for (const key of REQUIRED_KEYS) {
    if (!(fields.get(key) ?? '').trim()) {
      throw new Error(`[notes] ${file}: frontmatter に ${key} がありません（bun run notes:sync:all で埋めてください）`)
    }
  }

  return {
    slug,
    body,
    created: parseYamlScalar(fields.get('created') ?? ''),
    updated: parseYamlScalar(fields.get('updated') ?? ''),
    title: fields.has('title') ? parseYamlScalar(fields.get('title') ?? '') : undefined,
    description: fields.has('description') ? parseYamlScalar(fields.get('description') ?? '') : undefined,
    tags: parseYamlStringArray(fields.get('tags') ?? ''),
    type: fields.has('type') ? parseYamlScalar(fields.get('type') ?? '') : undefined,
  }
}

export const loadNotes = async (): Promise<{
  notes: Note[]
  bySlug: Map<string, Note>
  tags: TagSummary[]
  byTag: Map<string, TagSummary>
}> => {
  const files = readdirSync(NOTES_DIR).filter((file) => file.endsWith('.md'))
  const entries = files.map(readEntry)

  // 先にタイトルを集める。抜粋では `[[slug]]` をリンク先のタイトルとして表示するため。
  const titles = new Map(entries.map((entry) => [entry.slug, extractTitle(entry.body) ?? entry.slug]))

  const notes: Note[] = entries.map((entry) => {
    const frontmatterTags = entry.tags.map((tag) => normalizeTag(tag.replace(/^#/, '')))
    return {
      slug: entry.slug,
      title: titles.get(entry.slug) ?? entry.slug,
      created: entry.created,
      updated: entry.updated || entry.created,
      tags: [...new Set([...frontmatterTags, ...extractTags(entry.body)])],
      links: extractWikiLinks(entry.body),
      backlinks: [],
      excerpt: excerpt(entry.body, titles),
      hasMermaid: hasMermaid(entry.body),
      body: entry.body,
      type: entry.type ?? 'Note',
      description: entry.description || summary(entry.body, titles),
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
