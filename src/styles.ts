export const globalStyles = `
:root {
  --bg: #f8fbf8;
  --fg: #2b2b2b;
  --fg-sub: #6b6a68;
  --fg-faint: #9a9a96;
  --border: #dfe4df;
  --accent: #2f6f5b;
  --accent-soft: rgba(47, 111, 91, 0.1);
  --surface: #f1f4f1;
  color-scheme: light;
}

[data-theme='dark'] {
  --bg: #2b2b2b;
  --fg: #f8fbf8;
  --fg-sub: #b0b0aa;
  --fg-faint: #7e7e79;
  --border: #3e3f3d;
  --accent: #86c2aa;
  --accent-soft: rgba(134, 194, 170, 0.14);
  --surface: #333432;
  color-scheme: dark;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --bg: #2b2b2b;
    --fg: #f8fbf8;
    --fg-sub: #b0b0aa;
    --fg-faint: #7e7e79;
    --border: #3e3f3d;
    --accent: #86c2aa;
    --accent-soft: rgba(134, 194, 170, 0.14);
    --surface: #333432;
    color-scheme: dark;
  }
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans JP', sans-serif;
  font-size: 16px;
  line-height: 1.85;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 0.2em; }
a:hover { text-decoration-style: solid; }

.wrap { max-width: 44rem; margin: 0 auto; padding: 0 1.25rem; }

/* ---- header / footer ---- */

.site-header {
  border-bottom: 1px solid var(--border);
  margin-bottom: 3rem;
}

.site-header .wrap {
  display: flex;
  align-items: baseline;
  gap: 1.25rem;
  padding-top: 1.25rem;
  padding-bottom: 1.25rem;
}

.site-title {
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: 0.02em;
  color: var(--fg);
  text-decoration: none;
}

.site-nav {
  margin-left: auto;
  display: flex;
  align-items: baseline;
  gap: 1.1rem;
  font-size: 0.85rem;
}

.site-nav a { color: var(--fg-sub); text-decoration: none; }
.site-nav a:hover { color: var(--accent); }

#toggle-theme {
  border: 0;
  background: none;
  padding: 0;
  font: inherit;
  font-size: 0.95rem;
  line-height: 1;
  cursor: pointer;
  color: var(--fg-sub);
}
#toggle-theme:hover { color: var(--accent); }
.theme-dark { display: none; }
[data-theme='dark'] .theme-dark { display: inline; }
[data-theme='dark'] .theme-light { display: none; }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .theme-dark { display: inline; }
  :root:not([data-theme='light']) .theme-light { display: none; }
}

.site-footer {
  margin-top: 5rem;
  padding: 1.75rem 0 3rem;
  border-top: 1px solid var(--border);
  color: var(--fg-faint);
  font-size: 0.8rem;
}
.site-footer a { color: var(--fg-sub); }

/* ---- index ---- */

.lede {
  color: var(--fg-sub);
  font-size: 0.9rem;
  margin: 0 0 2.5rem;
}

.page-title {
  font-size: 1.3rem;
  margin: 0 0 1.75rem;
}

.note-list .note-meta { display: block; margin-bottom: 0.15rem; }

.note-list { list-style: none; margin: 0; padding: 0; }

.note-list li + li {
  margin-top: 1.75rem;
  padding-top: 1.75rem;
  border-top: 1px solid var(--border);
}

.note-list h2 {
  margin: 0 0 0.15rem;
  font-size: 1.05rem;
  line-height: 1.5;
}
.note-list h2 a { color: var(--fg); text-decoration: none; }
.note-list h2 a:hover { color: var(--accent); text-decoration: underline; }

.note-list p {
  margin: 0.3rem 0 0.5rem;
  color: var(--fg-sub);
  font-size: 0.875rem;
  line-height: 1.7;
}

.note-meta {
  font-size: 0.75rem;
  color: var(--fg-faint);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.03em;
}

/* ---- tags ---- */

.tag, .tag-pill {
  display: inline-block;
  font-size: 0.78rem;
  color: var(--accent);
  background: var(--accent-soft);
  border-radius: 999px;
  padding: 0.05em 0.65em;
  text-decoration: none;
  line-height: 1.6;
}
.tag:hover, .tag-pill:hover { text-decoration: underline; }

.tag-row { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.6rem; }

.tag-cloud { display: flex; flex-wrap: wrap; gap: 0.55rem; margin: 0; padding: 0; list-style: none; }
.tag-cloud .count { color: var(--fg-faint); font-size: 0.72rem; margin-left: 0.25em; }

/* ---- note page ---- */

.note-header { margin-bottom: 2.5rem; }
.note-header h1 {
  font-size: 1.6rem;
  line-height: 1.45;
  margin: 0 0 0.5rem;
  letter-spacing: 0.01em;
}

.note-body { overflow-wrap: anywhere; }
.note-body h2 {
  font-size: 1.2rem;
  margin: 2.75rem 0 0.9rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--border);
}
.note-body h3 { font-size: 1.05rem; margin: 2rem 0 0.6rem; }
.note-body h4 { font-size: 0.95rem; margin: 1.6rem 0 0.5rem; }
.note-body p { margin: 1.1rem 0; }
.note-body ul, .note-body ol { padding-left: 1.4rem; }
.note-body li { margin: 0.3rem 0; }
.note-body img { max-width: 100%; height: auto; }
.note-body hr { border: 0; border-top: 1px solid var(--border); margin: 2.5rem 0; }

.note-body blockquote {
  margin: 1.4rem 0;
  padding: 0.1rem 0 0.1rem 1rem;
  border-left: 3px solid var(--border);
  color: var(--fg-sub);
}

.note-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.86em;
  background: var(--surface);
  border-radius: 4px;
  padding: 0.1em 0.35em;
}

.note-body pre {
  margin: 1.5rem 0;
  padding: 0.9rem 1rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  overflow-x: auto;
  line-height: 1.6;
  font-size: 0.85rem;
}
.note-body pre code { background: none; padding: 0; font-size: inherit; }

.note-body table {
  border-collapse: collapse;
  width: 100%;
  margin: 1.5rem 0;
  font-size: 0.9rem;
  display: block;
  overflow-x: auto;
}
.note-body th, .note-body td {
  border: 1px solid var(--border);
  padding: 0.4rem 0.7rem;
  text-align: left;
}
.note-body th { background: var(--surface); }

.wikilink { text-decoration: none; border-bottom: 1px solid var(--accent-soft); }
.wikilink:hover { border-bottom-color: var(--accent); }
.wikilink.broken { color: var(--fg-faint); border-bottom: 1px dashed var(--fg-faint); cursor: help; }

/* shiki dual theme */
.shiki { color: var(--shiki-light); background-color: var(--shiki-light-bg); }
.shiki span { color: var(--shiki-light); }
[data-theme='dark'] .shiki { color: var(--shiki-dark); background-color: var(--shiki-dark-bg); }
[data-theme='dark'] .shiki span { color: var(--shiki-dark); }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .shiki {
    color: var(--shiki-dark);
    background-color: var(--shiki-dark-bg);
  }
  :root:not([data-theme='light']) .shiki span { color: var(--shiki-dark); }
}

.mermaid { margin: 1.75rem 0; overflow-x: auto; }
.mermaid svg { display: block; margin: 0 auto; }

/* ---- backlinks ---- */

.backlinks {
  margin-top: 4rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
}
.backlinks h2 { font-size: 0.85rem; color: var(--fg-sub); margin: 0 0 0.7rem; font-weight: 600; }
.backlinks ul { list-style: none; margin: 0; padding: 0; font-size: 0.9rem; }
.backlinks li { margin: 0.25rem 0; }

/* ---- not found ---- */

.not-found { padding: 3rem 0; }
.not-found h1 { font-size: 1.3rem; margin-bottom: 0.5rem; }
`
