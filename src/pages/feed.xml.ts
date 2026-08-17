import type { APIRoute } from 'astro'
import { site } from '../lib/config'
import { escapeHtml } from '../lib/markdown-text'
import { loadNotes } from '../lib/notes'

const toIso = (date: string, fallback: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : fallback

export const GET: APIRoute = async () => {
  const { notes } = await loadNotes()
  const buildTime = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const entries = notes.slice(0, 30)

  const body = entries
    .map((note) => {
      const url = `${site.origin}/${note.slug}`
      const categories = note.tags
        .map((tag) => `    <category term="${escapeHtml(tag)}"/>`)
        .join('\n')
      return `  <entry>
    <title>${escapeHtml(note.title)}</title>
    <link href="${url}"/>
    <id>${url}</id>
    <published>${toIso(note.created, buildTime)}</published>
    <updated>${toIso(note.updated, buildTime)}</updated>
    <summary>${escapeHtml(note.excerpt)}</summary>
${categories}
  </entry>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeHtml(site.name)} - ${escapeHtml(site.author)}</title>
  <subtitle>${escapeHtml(site.description)}</subtitle>
  <link href="${site.origin}/"/>
  <link rel="self" href="${site.origin}/feed.xml"/>
  <id>${site.origin}/</id>
  <updated>${entries.length > 0 ? toIso(entries[0].updated, buildTime) : buildTime}</updated>
  <author><name>${escapeHtml(site.author)}</name></author>
${body}
</feed>
`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
  })
}
