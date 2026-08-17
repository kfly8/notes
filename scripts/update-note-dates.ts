#!/usr/bin/env bun
//
// Stamp `created` / `updated` on the notes staged for the current commit, then
// re-stage them. Run by the pre-commit hook in .githooks/, or by hand with
// `bun run notes:dates`.
//
// The dates come from the commit, not from file mtime: a fresh clone or a CI
// checkout has meaningless mtimes.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/

const today = new Date().toISOString().slice(0, 10)

const stampDates = (source: string, date: string): string => {
  const match = FRONTMATTER.exec(source)
  if (!match) {
    return `---\ncreated: ${date}\nupdated: ${date}\n---\n${source}`
  }

  let head = match[1]
  if (!/^created:/m.test(head)) head = `created: ${date}\n${head}`
  head = /^updated:/m.test(head)
    ? head.replace(/^updated:.*$/m, `updated: ${date}`)
    : `${head}\nupdated: ${date}`

  return source.replace(FRONTMATTER, () => `---\n${head}\n---\n`)
}

const stagedNotes = execFileSync(
  'git',
  ['diff', '--cached', '--name-only', '--diff-filter=ACM'],
  { encoding: 'utf8' }
)
  .split('\n')
  .filter((path) => /^notes\/[^/]+\.md$/.test(path))

for (const path of stagedNotes) {
  const source = readFileSync(path, 'utf8')
  const stamped = stampDates(source, today)
  if (stamped === source) continue
  writeFileSync(path, stamped)
  execFileSync('git', ['add', path])
  console.log(`[notes] stamped ${path}`)
}
