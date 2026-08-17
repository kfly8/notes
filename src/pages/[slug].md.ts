import type { APIRoute, GetStaticPaths } from 'astro'
import { loadNotes } from '../lib/notes'
import { okfFrontmatter } from '../lib/okf'

/**
 * `/<slug>.md` でノートの Markdown ソースを返す。ページを読ませるよりソースを渡した方が
 * 早い相手（他のツールや AI）のための入口。frontmatter は Open Knowledge Format v0.2 に
 * 従って組み立てる。
 */
export const getStaticPaths: GetStaticPaths = async () => {
  const { notes } = await loadNotes()
  return notes.map((note) => ({ params: { slug: note.slug } }))
}

export const GET: APIRoute = async ({ params }) => {
  const { bySlug } = await loadNotes()
  const note = bySlug.get(params.slug ?? '')
  if (!note) return new Response('Not found', { status: 404 })

  return new Response(`${okfFrontmatter(note)}${note.entry.body ?? ''}`, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}
