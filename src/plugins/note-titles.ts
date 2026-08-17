import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { extractTitle } from '../lib/markdown-text'

const notesDir = join(process.cwd(), 'notes')

let cache: { key: string; titles: Map<string, string> } | undefined

/**
 * ディスク上の全ノートの slug からタイトルへの対応。1つのノートをレンダリングしている
 * 最中に `[[wikilink]]` を解決するために使う。ファイル名と mtime をキーにしているので、
 * dev サーバーを動かしたままノートを追加・改題しても再起動なしで解決できる。
 */
export const loadNoteTitles = (): Map<string, string> => {
  const files = readdirSync(notesDir).filter((file) => file.endsWith('.md'))
  const key = files.map((file) => `${file}:${statSync(join(notesDir, file)).mtimeMs}`).join('|')
  if (cache?.key === key) return cache.titles

  const titles = new Map<string, string>()
  for (const file of files) {
    const slug = file.slice(0, -'.md'.length)
    titles.set(slug, extractTitle(readFileSync(join(notesDir, file), 'utf8')) ?? slug)
  }

  cache = { key, titles }
  return titles
}
