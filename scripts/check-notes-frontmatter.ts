#!/usr/bin/env bun
//
// notes/*.md 全件について、frontmatter が本文から導出される値と整合しているかを検証する。
// 書き込みは一切行わない。CI (`.github/workflows/ci.yml`) から実行し、pre-commit フックが
// 無効な環境（`core.hooksPath` 未設定など）からのコミットがすり抜けていないかを検出する
// 最後の砦。
//
// tags は sync 側が和集合方式で書き込むため、本文からタグを削除した場合の検出はできない
// （既知の限界）。

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseYamlScalar, parseYamlStringArray } from '../src/lib/frontmatter-yaml'
import { extractTags, extractTitle } from '../src/lib/markdown-text'

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/
const FIELD_LINE = /^([A-Za-z][\w-]*):[ \t]*(.*)$/
const REQUIRED_KEYS = ['created', 'updated', 'title', 'description', 'tags'] as const

const notesDir = join(process.cwd(), 'notes')
const files = readdirSync(notesDir).filter((file) => file.endsWith('.md'))

let hasError = false
const fail = (file: string, message: string) => {
  hasError = true
  console.error(`[notes:check] ${file}: ${message}`)
}

for (const file of files) {
  const slug = file.slice(0, -'.md'.length)
  const source = readFileSync(join(notesDir, file), 'utf8')
  const match = FRONTMATTER.exec(source)

  if (!match) {
    fail(file, 'frontmatter がありません')
    continue
  }
  const body = source.slice(match[0].length)

  const fields = new Map<string, string>()
  for (const line of match[1].split('\n')) {
    const fieldMatch = FIELD_LINE.exec(line)
    if (fieldMatch) fields.set(fieldMatch[1], fieldMatch[2])
  }

  for (const key of REQUIRED_KEYS) {
    if (!(fields.get(key) ?? '').trim()) {
      fail(file, `frontmatter に ${key} がありません（bun run notes:sync:all で埋めてください）`)
    }
  }

  if (fields.has('title')) {
    const expected = extractTitle(body) ?? slug
    const actual = parseYamlScalar(fields.get('title') ?? '')
    if (actual !== expected) {
      fail(
        file,
        `title が本文の見出しと一致しません（frontmatter: "${actual}" / 本文: "${expected}"）。bun run notes:sync:all を実行してください`
      )
    }
  }

  if (fields.has('tags')) {
    const bodyTags = new Set(extractTags(body))
    const frontmatterTags = new Set(parseYamlStringArray(fields.get('tags') ?? ''))
    const missing = [...bodyTags].filter((tag) => !frontmatterTags.has(tag))
    if (missing.length > 0) {
      fail(
        file,
        `本文の #tag が frontmatter の tags に反映されていません: ${missing.join(', ')}。bun run notes:sync:all を実行してください`
      )
    }
  }
}

if (hasError) {
  console.error(`[notes:check] ${files.length} 件中、frontmatter が本文と一致しないノートがあります。`)
  process.exit(1)
}
console.log(`[notes:check] ${files.length} 件のノートの frontmatter を確認しました。`)
