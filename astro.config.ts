import cloudflare from '@astrojs/cloudflare'
import { satteri } from '@astrojs/markdown-satteri'
import solidJs from '@astrojs/solid-js'
import { defineConfig } from 'astro/config'

import { mermaid } from './src/plugins/mermaid'
import { noteLinks } from './src/plugins/note-links'
import { noteTitle } from './src/plugins/note-title'

export default defineConfig({
  site: 'https://notes.kobaken.co',
  output: 'static',
  adapter: cloudflare(),
  // `/slug/index.html` ではなく `/slug.html` を出す。`/slug` へのリンクが末尾スラッシュへの
  // リダイレクトなしで解決されるようにするため。
  build: { format: 'file' },
  trailingSlash: 'never',
  // 動的な要素がないので、セッションのランタイム（と KV バインディング）を Worker から外す。
  session: false,
  integrations: [solidJs()],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    },
    processor: satteri({
      mdastPlugins: [noteTitle, mermaid, noteLinks],
    }),
  },
})
