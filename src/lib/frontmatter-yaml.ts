// notes/*.md の frontmatter 値を YAML の1行スカラーとして安全に読み書きするためのヘルパー。
//
// 対象は `scripts/sync-notes-frontmatter.ts` が書き込む値だけなので、シングルクォート文字列や
// ブロックスカラー（`|`/`>`）、複数行の配列表記のような一般の YAML は扱わない。プレーン表記か
// JSON 文字列（YAML は JSON のスーパーセット）の往復ができれば十分という前提。
//
// astro:content には依存しない（markdown-text.ts と同じ立ち位置）。

const UNSAFE_START = /^[-?:,[\]{}#&*!|>'"%@`\s]/

/**
 * YAML のスカラーとして書き出す。クォートなしで安全に置けるときはそのまま、
 * 曖昧さが残るときは JSON 形式でクォートする。
 */
export const yamlScalar = (value: string): string => {
  const plain =
    value.length > 0 &&
    !UNSAFE_START.test(value) &&
    !/: /.test(value) &&
    !/ #/.test(value) &&
    !/[\n\r]/.test(value) &&
    !/\s$/.test(value)
  return plain ? value : JSON.stringify(value)
}

/** 文字列配列をフロー配列 `[a, "b c"]` として書き出す（`tags: ` 部分は含まない）。 */
export const yamlFlowSequence = (values: string[]): string =>
  `[${values.map(yamlScalar).join(', ')}]`

/** `yamlScalar()` の出力を文字列に戻す。プレーン表記と JSON 文字列表記だけに対応する。 */
export const parseYamlScalar = (raw: string): string => {
  const trimmed = raw.trim()
  if (trimmed.startsWith('"')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      // 壊れていれば生の文字列として扱う
    }
  }
  return trimmed
}

/** `yamlFlowSequence()` の出力を文字列配列に戻す。 */
export const parseYamlStringArray = (raw: string): string[] => {
  const inner = raw.trim().replace(/^\[/, '').replace(/\]$/, '').trim()
  if (inner === '') return []
  const tokens = inner.match(/"(?:[^"\\]|\\.)*"|[^,]+/g) ?? []
  return tokens.map((token) => parseYamlScalar(token.trim())).filter((token) => token.length > 0)
}
