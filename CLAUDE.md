# notes.kobaken.co

kobaken's personal note site. Markdown files in `notes/` are rendered to static HTML by
Hono's SSG helper and served as Cloudflare Workers static assets.

Notes themselves are written in Japanese. This file, the README and source comments are in English.

## Where note material may come from — read this first

**This repository is public.** Anything committed here is published immediately and cannot be
taken back, so the boundary below is a hard rule, not a preference.

A note may only be based on research done in a session whose working directory is on the
allowlist in `.claude/allowed-sources.txt`:

- `/Users/kfly8/src/github.com/kfly8/*`
- `/Users/kfly8/src/github.com/kfly8-sandbox/*`
- `/Users/kfly8/src/github.com/piconic-ai/barefootjs`
- `/Users/kfly8/src/github.com/piconic-ai/agent-koans`

Everything else — client work above all — is off limits, **even when the finding looks like
generic public knowledge**. What leaks is rarely the technique itself but the context around it:
why it was investigated, what the surrounding architecture looks like, which names appear in the
examples. If such a topic deserves a note, research it again from public sources in a session
rooted in an allowlisted directory, and write the note from those sources alone.

`.claude/hooks/guard-notes.sh` runs as a `PreToolUse` hook and blocks writes to `notes/*.md`
from sessions outside the allowlist. It is a backstop for mistakes, not the rule itself — never
work around it. To allow another directory, add a glob line to `.claude/allowed-sources.txt`.

## Design principles for notes

1. **One note, one concept.** If a note grows a second topic, split it out and link the two.
2. **Write about concepts, not events.** The subject is the topic itself, not "the article I read"
   or "what I did today".
3. **Link densely.** Before creating a note, grep `notes/*.md` for existing mentions of the topic
   and turn plain-text mentions into `[[...]]` links. Links are the value of this site.
4. **Associative, not hierarchical.** No folders. Relate notes with `[[...]]` links and `#tag`.
5. **Write for yourself.** Rough is fine. No preamble, no reader hand-holding.
6. **Re-read the structure after appending.** When adding a section to an existing note, check
   that the note as a whole still flows — headings in a sensible order, no duplication.

## Adding a note

1. Create `notes/<kebab-case-slug>.md`. The slug becomes the URL (`/<slug>`), so keep it to
   lowercase ASCII and hyphens.
2. Frontmatter holds the dates:

   ```
   ---
   created: 2026-08-17
   updated: 2026-08-17
   ---
   ```

   `bun run notes:dates` fills these in for changed files, and the pre-commit hook runs it
   automatically. Do not hand-edit them afterwards.
3. The first line of the body is `# タイトル` (Japanese). It is stripped from the body and used as
   the page title, so do not repeat it as an `<h1>` later.
4. Write the body in Markdown. Fenced code blocks get syntax highlighting via shiki — always tag
   the language.
5. Put `#tag`s on the last line.
6. Run `bun run build`. Broken `[[...]]` links are reported as warnings on stderr.
7. Commit `notes/*.md`. Markdown-only changes can go straight to `main`; changes to the site code
   go through a PR.

## Wiki links

`[[slug]]` links to another note and renders using that note's title. `[[slug|表示テキスト]]`
overrides the text. Unresolved targets render as dotted grey text and produce a build warning.

Backlinks are collected automatically and shown at the bottom of each note — never maintain them
by hand.

When writing a new note, link out to related existing notes, and add a link from those notes back
to the new one where it fits naturally (principle 3).

## Tags

Written inline as `#tag`, conventionally on the last line of the note.

- Must start with a letter (ASCII or Japanese): `#hono`, `#戦国時代`, `#ai-agent`. Digits and
  underscores cannot start a tag, so `#123` and `#_foo` are left alone.
- ASCII tags are lowercased (`#AI` and `#ai` are the same tag). Japanese tags are not normalised,
  so watch out for inconsistent spellings.
- A `#` glued to a preceding word character is not a tag, which keeps `C#` and URL fragments safe.
- Tags inside code blocks and inline code are never interpreted.
- `/tags/` lists every tag.

Frontmatter also accepts `tags: [foo, bar]` for tags that should not appear in the body, but
inline tags are the norm.

## Diagrams

A ```mermaid fenced block is rendered client-side by mermaid.js, loaded only on pages that use it.
Prefer a diagram over ASCII art for network topologies, sequences and state machines.

## Tone

- Rough personal memo, in Japanese. Concrete commands, versions and observed results beat prose.
- Never write something you cannot source. When the note comes out of web research, end it with a
  `## 出典` section linking the sources. Mark guesses as guesses, or leave them out.
- Stay factual about products and technologies, including ones that did not work out. No
  evaluative or inflammatory framing, even when quoting a source that uses it.

## Suggesting notes

- After answering an open research question about some technology, product or term, ask whether
  to keep the result as a note here.
- After writing a note, look for concepts it mentions in passing that have no note of their own,
  and offer to split them out.

## Claude Code on web

Web sessions clone this repository, so the allowlist check falls back to "the working directory is
this repository". Writing notes from a web session works as-is; open this repository when doing
research meant to end up here.

Web sessions cannot reach local client repositories, which is the safe side of the boundary. The
rule above still applies to anything carried over from another session.

## Development

```sh
bun run dev      # Vite dev server
bun run build    # generate dist/
bun run preview  # build, then serve dist/ with wrangler
bun run deploy   # build, then wrangler deploy
```

- `notes/*.md` — note sources; the filename is the slug
- `src/lib/notes.ts` — loads every note via `import.meta.glob`, builds the link/backlink/tag index
- `src/lib/markdown.ts` — marked extensions for `[[wikilink]]` and `#tag`, shiki highlighting
- `src/index.tsx` — routes (`/`, `/:slug`, `/tags/`, `/tags/:tag`, `/feed`, `/404`)
- `src/renderer.tsx` — the HTML shell, theme toggle, mermaid loader
- `src/styles.ts` — CSS, inlined into every page
- `scripts/update-note-dates.ts` — fills in `created` / `updated`; run by the pre-commit hook

Routes are static: `/feed` is emitted as `dist/feed.xml` because of its `application/atom+xml`
content type, and `/404` becomes `dist/404.html`, which `not_found_handling` picks up.
