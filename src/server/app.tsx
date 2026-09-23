import { Hono } from 'hono'
import { ssgParams } from 'hono/ssg'
import { Layout } from '../components/Layout'
import { NoteList } from '../components/NoteList'
import { site } from '../lib/config'
import { escapeHtml, notePath, plainText, tagPath } from '../lib/markdown-text'
import { okfFrontmatter } from '../lib/okf'
import { loadNotes } from './notes'
import { renderMarkdown } from './render-markdown'

// vite build 完了後に scripts/build-site.ts から設定される。ビルド前・開発サーバー起動直後は
// 空文字のままで、検索アイランドは読み込まれない（vite build --watch の初回完了を待つ）。
let clientScriptUrl = ''
export const setClientScriptUrl = (url: string): void => {
  clientScriptUrl = url
}

const app = new Hono()

const toIso = (date: string, fallback: string): string =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : fallback

app.get('/', async (c) => {
  const { notes } = await loadNotes()
  return c.html(
    <Layout path="/" clientScriptUrl={clientScriptUrl}>
      <p class="lede">{site.description}</p>
      <NoteList notes={notes} />
    </Layout>
  )
})

app.get('/tags', async (c) => {
  const { tags } = await loadNotes()
  return c.html(
    <Layout path="/tags" title="タグ" description="ノートに付けられたタグの一覧" clientScriptUrl={clientScriptUrl}>
      <h1 class="page-title">タグ</h1>
      <ul class="tag-cloud">
        {tags.map((entry) => (
          <li>
            <a class="tag-pill" href={tagPath(entry.tag)}>
              #{entry.tag}
              <span class="count">{entry.notes.length}</span>
            </a>
          </li>
        ))}
      </ul>
    </Layout>
  )
})

app.get(
  '/tags/:tag',
  ssgParams(async () => {
    const { tags } = await loadNotes()
    return tags.map((entry) => ({ tag: entry.tag }))
  }),
  async (c) => {
    const tag = c.req.param('tag')
    const { byTag } = await loadNotes()
    const entry = byTag.get(tag)
    if (!entry) return c.notFound()

    return c.html(
      <Layout
        path={tagPath(tag)}
        title={`#${entry.tag}`}
        description={`#${entry.tag} のタグが付いたノート`}
        clientScriptUrl={clientScriptUrl}
      >
        <h1 class="page-title">#{entry.tag}</h1>
        <NoteList notes={entry.notes} />
      </Layout>
    )
  }
)

app.get('/feed.xml', async (c) => {
  const { notes } = await loadNotes()
  const buildTime = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  const entries = notes.slice(0, 30)

  const body = entries
    .map((note) => {
      const url = `${site.origin}/${note.slug}`
      const categories = note.tags.map((tag) => `    <category term="${escapeHtml(tag)}"/>`).join('\n')
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

  return c.text(xml, 200, { 'Content-Type': 'application/atom+xml; charset=utf-8' })
})

app.get('/search-index.json', async (c) => {
  const { notes } = await loadNotes()
  const docs = notes.map((note) => ({
    slug: note.slug,
    title: note.title,
    tags: note.tags,
    text: plainText(note.body),
  }))
  return c.json(docs)
})

app.get('/404', async (c) => {
  return c.html(
    <Layout path="/404" title="Not Found" clientScriptUrl={clientScriptUrl}>
      <div class="not-found">
        <h1>ページが見つかりません</h1>
        <p>
          URL が変わったか、ノートが削除された可能性があります。<a href="/">ノート一覧</a>から探してみてください。
        </p>
      </div>
    </Layout>
  )
})

// `/:slug.md` は toSSG の対象に含めない（build-site.ts が直接書き出す。理由は plan 参照）。
// 開発用ライブサーバーではリクエストが実際に来るので、ここに直接ルートを足す。
app.get('/:slug{[^.]+[.]md}', async (c) => {
  const slug = c.req.param('slug').replace(/\.md$/, '')
  const { bySlug } = await loadNotes()
  const note = bySlug.get(slug)
  if (!note) return c.notFound()

  return c.text(`${okfFrontmatter(note)}${note.body}`, 200, {
    'Content-Type': 'text/markdown; charset=utf-8',
  })
})

// 固定パス（/tags, /feed.xml 等）より後ろに置き、それらと衝突しないようにする。
app.get(
  '/:slug',
  ssgParams(async () => {
    const { notes } = await loadNotes()
    return notes.map((note) => ({ slug: note.slug }))
  }),
  async (c) => {
    const slug = c.req.param('slug')
    const { bySlug } = await loadNotes()
    const note = bySlug.get(slug)
    if (!note) return c.notFound()

    const contentHtml = await renderMarkdown(note.body)

    return c.html(
      <Layout
        path={notePath(note.slug)}
        title={note.title}
        description={note.excerpt}
        markdown={`/${note.slug}.md`}
        clientScriptUrl={clientScriptUrl}
      >
        <article>
          <header class="note-header">
            <h1>{note.title}</h1>
            <div class="note-meta">
              {note.created && <span>作成 {note.created}</span>}
              {note.updated && note.updated !== note.created && <span> / 更新 {note.updated}</span>}
              <span>
                {' '}
                / <a href={`/${note.slug}.md`}>markdown</a>
              </span>
            </div>
          </header>

          <div class="note-body" dangerouslySetInnerHTML={{ __html: contentHtml }} />

          {note.backlinks.length > 0 && (
            <section class="backlinks">
              <h2>このノートにリンクしているノート</h2>
              <ul>
                {note.backlinks.map((ref) => (
                  <li>
                    <a href={notePath(ref.slug)}>{ref.title}</a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </Layout>
    )
  }
)

export default app
