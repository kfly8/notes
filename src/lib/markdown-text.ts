// ノートのソースに対するプレーンテキスト処理。astro.config から読まれるプラグインと
// ノートの索引の両方が使うので、このモジュールは `astro:content` を import しない。

/**
 * ウィキリンク: `[[slug]]` または `[[slug|表示テキスト]]`。
 */
export const WIKI_LINK = /\[\[([^\]|\n]+?)(?:\|([^\]\n]+?))?\]\]/g

/**
 * タグは文字（英字または日本語）で始まり、以降は文字・数字・アンダースコア・ハイフン。
 * 先頭のグループが「直前が英数字の `#`」を弾くので、`C#` や URL のフラグメントは
 * タグとして扱われない。
 */
export const HASH_TAG = /(^|[^\p{L}\p{N}_])#([\p{L}][\p{L}\p{N}_-]*)/gu

export const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** 英字タグは小文字に正規化して `#AI` と `#ai` を同じ扱いにする。日本語はそのまま。 */
export const normalizeTag = (tag: string): string =>
  /^[A-Za-z0-9_-]+$/.test(tag) ? tag.toLowerCase() : tag

export const tagPath = (tag: string): string => `/tags/${tag}`

export const notePath = (slug: string): string => `/${slug}`

export const stripFrontmatter = (source: string): string =>
  source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')

/** ノートのタイトルは本文の最初の `# ...` 行。 */
export const extractTitle = (source: string): string | undefined =>
  /^[ \t]*#[ \t]+(.+?)[ \t]*$/m.exec(stripFrontmatter(source))?.[1]

/** コード中のタグやリンクを拾わないよう、フェンスとインラインコードを空白で潰す。 */
const withoutCode = (body: string): string =>
  body.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')

/** フェンスは落とし、インラインコードは中身を残す。識別子を文として読めるようにするため。 */
const withoutFences = (body: string): string =>
  body.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`\n]*)`/g, '$1')

export const extractTags = (body: string): string[] => {
  const found = new Set<string>()
  for (const match of withoutCode(body).matchAll(HASH_TAG)) {
    found.add(normalizeTag(match[2]))
  }
  return [...found]
}

export const extractWikiLinks = (body: string): string[] => {
  const found = new Set<string>()
  for (const match of withoutCode(body).matchAll(WIKI_LINK)) {
    found.add(match[1].trim().replace(/\.md$/, ''))
  }
  return [...found]
}

export const hasMermaid = (body: string): boolean => /^```mermaid\b/m.test(body)

/** 検索用に本文をプレーンテキスト化したもの。フェンスはノイズなので落とす。 */
export const plainText = (body: string, limit = 2000): string =>
  withoutFences(body)
    .replace(WIKI_LINK, (_, target: string, label?: string) => label ?? target)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/[*_>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit)

/**
 * 冒頭の1文だけを取り出した要約。OKF の `description` に使う。
 * 日本語の句点（。．）は直後の空白なしでも文末とみなす。`.`/`!`/`?` は
 * `element.focus()` のようなインラインコードの中の `.` を誤って文末と扱わないよう、
 * 直後が空白か文字列末尾のときだけ文末とみなす。
 */
export const summary = (body: string, titles?: Map<string, string>): string => {
  const text = excerpt(body, titles, 200)
  const [first] = text.split(/(?<=[。．])|(?<=[.!?])(?=\s|$)/)
  return first && first.length > 0 ? first : text
}

/**
 * 一覧ページとフィードで使う、ノート冒頭のプレーンテキスト。slug からタイトルへの
 * マップを渡すと、ラベルなしの `[[slug]]` がリンク先のタイトルとして読める。
 */
export const excerpt = (body: string, titles?: Map<string, string>, length = 120): string => {
  const withoutTitle = body.replace(/^[ \t]*#[ \t]+.+?$/m, '')
  const paragraph = withoutFences(withoutTitle)
    .split(/\r?\n\s*\r?\n/)
    .map((block) => block.trim())
    .find((block) => block.length > 0 && !/^[#>|\-*]/.test(block))
  const text = (paragraph ?? '')
    .replace(
      WIKI_LINK,
      (_, target: string, label?: string) =>
        label ?? titles?.get(target.trim().replace(/\.md$/, '')) ?? target
    )
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // アンダースコアは剥がさない。イタリック記法として使われている実例はコーパスに無く、
    // `GITHUB_TOKEN` のようなインラインコード中の識別子から `_` だけ剥ぎ取ってしまう
    // （withoutFences がバッククォートを外した後なので、通常の識別子と区別が付かない）。
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > length ? `${text.slice(0, length)}…` : text
}
