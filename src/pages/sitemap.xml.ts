import type { APIRoute } from 'astro'
import { site } from '../lib/config'
import { tagPath } from '../lib/markdown-text'
import { loadNotes } from '../lib/notes'

const toIso = (date: string, fallback: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : fallback

export const GET: APIRoute = async () => {
  const { notes, tags } = await loadNotes()
  const buildTime = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

  const staticUrls: Array<{ loc: string; lastmod: string }> = [
    { loc: `${site.origin}/`, lastmod: buildTime },
    { loc: `${site.origin}/tags`, lastmod: buildTime },
  ]

  const noteUrls = notes.map((note) => ({
    loc: `${site.origin}/${note.slug}`,
    lastmod: toIso(note.updated, buildTime),
  }))

  const tagUrls = tags.map((entry) => ({
    loc: `${site.origin}${tagPath(entry.tag)}`,
    lastmod: buildTime,
  }))

  const urls = [...staticUrls, ...noteUrls, ...tagUrls]

  const body = urls
    .map(
      (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
  </url>`
    )
    .join('\n')

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
