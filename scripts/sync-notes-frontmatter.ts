#!/usr/bin/env bun
//
// これからコミットするノートの frontmatter (created/updated/title/description/tags) を
// 本文から導出して書き込み、ステージし直す。.githooks/ の pre-commit フックから実行される
// ほか、`bun run notes:sync` でも動く。`--all` を付けると git のステージ状態に関係なく
// notes/ 配下の全ファイルを対象にする（既存ノートへの一括移行・リフレッシュ用）。
//
// - created/updated: ファイルの mtime ではなくコミットのタイミングから取る。clone し直した
//   直後や CI のチェックアウトでは mtime が意味を持たないため。updated は「ステージされた
//   = 今日更新された」とはみなさず、本文が HEAD の内容と実際に変わっているときだけ今日の
//   日付にする。frontmatter だけを機械的に補完するコミット（--all での一括移行など）で
//   updated が本文と無関係に書き換わらないようにするため。
// - title: 常に本文の `# 見出し` から上書きする。本文が正で、frontmatter 側の手編集は
//   想定しない。
// - description: 既に値があれば触らない（手動指定を優先する）。空のときだけ本文冒頭の
//   1文から生成する。
// - tags: 本文中の `#tag` と、既存 frontmatter の tags（本文に出したくない隠しタグ用）の
//   和集合を書き込む。本文からタグを削除しても、この和集合方式では frontmatter 側から
//   自動では消えない。

import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseYamlStringArray, yamlFlowSequence, yamlScalar } from '../src/lib/frontmatter-yaml'
import { extractTags, extractTitle, summary } from '../src/lib/markdown-text'
import { loadNoteTitles } from '../src/plugins/note-titles'

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/
const FIELD_LINE = /^([A-Za-z][\w-]*):[ \t]*(.*)$/
const MANAGED_ORDER = ['created', 'updated', 'title', 'description', 'tags'] as const

const notesDir = join(process.cwd(), 'notes')
const today = new Date().toISOString().slice(0, 10)

/** frontmatter の中身（`---` の間）を key -> 生の値文字列 の Map にする。1行1フィールド前提。 */
const parseHead = (head: string): Map<string, string> => {
  const fields = new Map<string, string>()
  for (const line of head.split('\n')) {
    const match = FIELD_LINE.exec(line)
    if (match) fields.set(match[1], match[2])
  }
  return fields
}

/** MANAGED_ORDER のキーを先に並べ、それ以外（type など）は元の登場順で後に続ける。 */
const buildHead = (fields: Map<string, string>): string => {
  const managed = MANAGED_ORDER.filter((key) => fields.has(key))
  const rest = [...fields.keys()].filter((key) => !(MANAGED_ORDER as readonly string[]).includes(key))
  return [...managed, ...rest].map((key) => `${key}: ${fields.get(key)}`).join('\n')
}

/** HEAD 上のそのファイルの本文（frontmatter を除いた部分）。無ければ新規ファイル扱いで undefined。 */
const headBody = (path: string): string | undefined => {
  let content: string
  try {
    content = execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' })
  } catch {
    return undefined
  }
  const match = FRONTMATTER.exec(content)
  return match ? content.slice(match[0].length) : content
}

const syncNote = (source: string, path: string, slug: string, titles: Map<string, string>): string => {
  const match = FRONTMATTER.exec(source)
  const head = match?.[1] ?? ''
  const body = match ? source.slice(match[0].length) : source
  const fields = parseHead(head)

  if (!fields.has('created')) fields.set('created', today)
  // 本文が HEAD から実際に変わっている（＝新規ファイルも含む）ときだけ今日の日付にする。
  const bodyChanged = headBody(path) !== body
  if (bodyChanged || !fields.has('updated')) fields.set('updated', today)

  const title = extractTitle(body) ?? slug
  fields.set('title', yamlScalar(title))

  const hasDescription = (fields.get('description') ?? '').trim().length > 0
  if (!hasDescription) fields.set('description', yamlScalar(summary(body, titles)))

  const existingTags = fields.has('tags') ? parseYamlStringArray(fields.get('tags') ?? '') : []
  const mergedTags = [...new Set([...existingTags, ...extractTags(body)])]
  fields.set('tags', yamlFlowSequence(mergedTags))

  return `---\n${buildHead(fields)}\n---\n${body}`
}

const targetPaths = (): string[] => {
  if (process.argv.includes('--all')) {
    return readdirSync(notesDir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => `notes/${file}`)
  }
  return execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACM'],
    { encoding: 'utf8' }
  )
    .split('\n')
    .filter((path) => /^notes\/[^/]+\.md$/.test(path))
}

const titles = loadNoteTitles()

for (const path of targetPaths()) {
  const slug = path.slice('notes/'.length, -'.md'.length)
  const source = readFileSync(path, 'utf8')
  const synced = syncNote(source, path, slug, titles)
  if (synced === source) continue
  writeFileSync(path, synced)
  execFileSync('git', ['add', path])
  console.log(`[notes] synced ${path}`)
}
