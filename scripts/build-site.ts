#!/usr/bin/env bun
//
// ビルドを1本のスクリプトで直列に実行する。
//   1. vite build で検索アイランド(CSR)をビルドし、dist/client/.vite/manifest.json を生成
//   2. manifest からマウントスクリプトの実 URL を解決し、app.tsx に設定
//   3. toSSG で Hono アプリを静的化(dist/client に追記。vite の emptyOutDir は初回のみなので
//      この順序なら衝突しない)
//   4. `/<slug>.md` は ssgParams + toSSG のブートストラップと相性が悪いため、toSSG を経由せず
//      ここで直接書き出す(詳細は plan 参照)
import { copyFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'vite'
import { loadManifest, resolveScriptAssets } from '@barefootjs/vite'
import { toSSG } from 'hono/bun'
import { defaultExtensionMap } from 'hono/ssg'
import app, { setClientScriptUrl } from '../src/server/app'
import { loadNotes } from '../src/server/notes'
import { okfFrontmatter } from '../src/lib/okf'

const OUT_DIR = resolve(process.cwd(), 'dist/client')

async function main() {
  await build()

  // public/ 配下は vite build が自動でコピーするが、global.css は src/styles/ に
  // あるので別枠でコピーする(publicDir を切り替えると public/ の他のファイルが
  // コピーされなくなるため)。
  await copyFile(
    resolve(process.cwd(), 'src/styles/global.css'),
    resolve(OUT_DIR, 'global.css')
  )

  const manifest = await loadManifest(OUT_DIR, true)
  const [scriptUrl] = resolveScriptAssets(manifest, 'src/islands/mount.ts', '/')
  if (!scriptUrl) throw new Error('[build] Vite manifest に search-mount のエントリが見つかりません')
  setClientScriptUrl(scriptUrl)

  const result = await toSSG(app, {
    dir: OUT_DIR,
    extensionMap: { ...defaultExtensionMap, 'application/json': 'json' },
    // `/:slug.md` は正規表現制約付き動的ルートで toSSG のブートストラップ疑似リクエストと
    // 相性が悪く(ssgParams が発火せず c.req.param('slug') が undefined になる)、
    // どのみち下で直接書き出すので、ここでは素通りさせずスキップする。
    plugins: [
      {
        // 未置換のルートパターン文字列がそのまま疑似リクエストの URL になる
        // （`{`/`}` は %7B/%7D にエンコードされる）。正規表現制約付き動的ルートは
        // ssgParams を持たずこの疑似リクエストがそのままハンドラに届いてしまうので、
        // ルートパターンらしき URL（`%7B` を含む）は素通りさせずスキップする。
        beforeRequestHook: (req) => (new URL(req.url).pathname.includes('%7B') ? false : req),
      },
    ],
  })
  if (!result.success) {
    throw result.error ?? new Error('[build] toSSG に失敗しました')
  }
  console.log(`[build] toSSG: ${result.files.length} 件のファイルを生成しました`)

  const { notes } = await loadNotes()
  await Promise.all(
    notes.map((note) =>
      writeFile(resolve(OUT_DIR, `${note.slug}.md`), `${okfFrontmatter(note)}${note.body}`, 'utf8')
    )
  )
  console.log(`[build] ${notes.length} 件の /<slug>.md を書き出しました`)

  // manifest.json は配信時に不要な内部情報なので、公開ディレクトリから消す。
  await rm(resolve(OUT_DIR, '.vite'), { recursive: true, force: true })
}

await main()
