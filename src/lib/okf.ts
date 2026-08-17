// Open Knowledge Format (OKF) v0.2 の frontmatter を組み立てる。
// 仕様: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
//
// 出すのはノートを一目で捉えるための最小限だけ。必須の `type` に、推奨フィールドのうち
// `title` / `description` / `tags` を加える。日付や生成者のような追跡用のフィールドは、
// ノートを取り込む側が必要としないので載せない。

import type { Note } from './notes'

const UNSAFE_START = /^[-?:,[\]{}#&*!|>'"%@`\s]/

/**
 * YAML のスカラーとして書き出す。クォートなしで安全に置けるときはそのまま、
 * 曖昧さが残るときは JSON 形式でクォートする（YAML は JSON のスーパーセット）。
 */
const yamlScalar = (value: string): string => {
  const plain =
    value.length > 0 &&
    !UNSAFE_START.test(value) &&
    !/: /.test(value) &&
    !/ #/.test(value) &&
    !/[\n\r]/.test(value) &&
    !/\s$/.test(value)
  return plain ? value : JSON.stringify(value)
}

export const okfFrontmatter = (note: Note): string => {
  const lines = [`type: ${yamlScalar(note.type)}`, `title: ${yamlScalar(note.title)}`]

  if (note.description) lines.push(`description: ${yamlScalar(note.description)}`)
  if (note.tags.length > 0) {
    lines.push(`tags: [${note.tags.map(yamlScalar).join(', ')}]`)
  }

  return `---\n${lines.join('\n')}\n---\n`
}
