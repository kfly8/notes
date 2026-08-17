import 'hono'
import { Hono } from 'hono'
import { ssgParams } from 'hono/ssg'
import { NoteList } from './components/note-list'
import { NoteArticle } from './components/note'
import { site } from './config'
import { atomFeed } from './feed'
import { tagPath } from './lib/markdown'
import { noteBySlug, notes, tagByName, tags } from './lib/notes'
import { renderer } from './renderer'

const buildTime = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

const app = new Hono()

app.use('*', renderer)

app.get('/', (c) =>
  c.render(
    <>
      <p class="lede">{site.description}</p>
      <NoteList notes={notes} />
    </>,
    { path: '/' }
  )
)

app.get('/tags/', (c) =>
  c.render(
    <>
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
    </>,
    { title: 'タグ', description: 'ノートに付けられたタグの一覧', path: '/tags/' }
  )
)

app.get(
  '/tags/:tag',
  ssgParams(() => tags.map((entry) => ({ tag: entry.tag }))),
  (c) => {
    const entry = tagByName.get(c.req.param('tag'))
    if (!entry) return c.notFound()
    return c.render(
      <>
        <h1 class="page-title">#{entry.tag}</h1>
        <NoteList notes={entry.notes} />
      </>,
      {
        title: `#${entry.tag}`,
        description: `#${entry.tag} のタグが付いたノート`,
        path: tagPath(entry.tag),
      }
    )
  }
)

app.get('/feed', (c) =>
  c.body(atomFeed(notes, buildTime), 200, {
    'Content-Type': 'application/atom+xml; charset=utf-8',
  })
)

app.get('/404', (c) =>
  c.render(
    <div class="not-found">
      <h1>ページが見つかりません</h1>
      <p>
        URL が変わったか、ノートが削除された可能性があります。<a href="/">ノート一覧</a>から探してみてください。
      </p>
    </div>,
    { title: 'Not Found', path: '/404' }
  )
)

app.get(
  '/:slug',
  ssgParams(() => notes.map((note) => ({ slug: note.slug }))),
  (c) => {
    const note = noteBySlug.get(c.req.param('slug'))
    if (!note) return c.notFound()
    return c.render(<NoteArticle note={note} />, {
      title: note.title,
      description: note.excerpt,
      path: `/${note.slug}`,
      mermaid: note.hasMermaid,
    })
  }
)

export default app
