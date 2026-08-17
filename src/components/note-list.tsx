import { notePath, tagPath } from '../lib/markdown'
import type { Note } from '../lib/notes'

export const NoteList = ({ notes }: { notes: Note[] }) => (
  <ul class="note-list">
    {notes.map((note) => (
      <li>
        <div class="note-meta">{note.updated || note.created}</div>
        <h2>
          <a href={notePath(note.slug)}>{note.title}</a>
        </h2>
        {note.excerpt ? <p>{note.excerpt}</p> : null}
        {note.tags.length > 0 ? (
          <div class="tag-row">
            {note.tags.map((tag) => (
              <a class="tag-pill" href={tagPath(tag)}>
                #{tag}
              </a>
            ))}
          </div>
        ) : null}
      </li>
    ))}
  </ul>
)
