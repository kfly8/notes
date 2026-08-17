import { raw } from 'hono/html'
import { notePath } from '../lib/markdown'
import type { Note } from '../lib/notes'

export const NoteArticle = ({ note }: { note: Note }) => (
  <article>
    <header class="note-header">
      <h1>{note.title}</h1>
      <div class="note-meta">
        {note.created ? <span>作成 {note.created}</span> : null}
        {note.updated && note.updated !== note.created ? (
          <span> / 更新 {note.updated}</span>
        ) : null}
      </div>
    </header>

    <div class="note-body">{raw(note.html)}</div>

    {note.backlinks.length > 0 ? (
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
    ) : null}
  </article>
)
