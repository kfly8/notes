import type { APIRoute } from 'astro'
import { plainText } from '../lib/markdown-text'
import { loadNotes } from '../lib/notes'

/** ヘッダーの Solid 検索アイランドが読み込むインデックス。 */
export const GET: APIRoute = async () => {
  const { notes } = await loadNotes()

  const docs = notes.map((note) => ({
    slug: note.slug,
    title: note.title,
    tags: note.tags,
    text: plainText(note.entry.body ?? ''),
  }))

  return new Response(JSON.stringify(docs), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}
