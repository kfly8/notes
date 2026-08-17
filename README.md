# notes

Personal notes, published at <https://notes.kobaken.co>.

Markdown in `notes/` is rendered to static HTML by Hono's SSG helper and served as Cloudflare
Workers static assets. Notes are written in Japanese.

See [CLAUDE.md](./CLAUDE.md) for how notes are written — and, more importantly, which research is
allowed to become a note here.

## Development

```sh
bun install
git config core.hooksPath .githooks   # once: stamps created/updated on commit

bun run dev      # Vite dev server
bun run build    # generate dist/
bun run preview  # build, then serve dist/ with wrangler
bun run deploy   # build, then wrangler deploy
```

## Layout

| Path | What |
| --- | --- |
| `notes/*.md` | note sources; filename is the URL slug |
| `src/lib/notes.ts` | loads notes, builds the link / backlink / tag index |
| `src/lib/markdown.ts` | `[[wikilink]]` and `#tag` extensions, shiki highlighting |
| `src/index.tsx` | routes |
| `src/renderer.tsx` | HTML shell, theme toggle, mermaid loader |
| `src/styles.ts` | CSS, inlined into every page |
| `scripts/update-note-dates.ts` | fills in `created` / `updated` for staged notes |

## Deployment

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and deploys the Worker.
It needs two repository secrets:

- `CLOUDFLARE_API_TOKEN` — a token with the *Edit Cloudflare Workers* template
- `CLOUDFLARE_ACCOUNT_ID`

The custom domain `notes.kobaken.co` is declared in `wrangler.jsonc`.
