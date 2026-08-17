---
created: 2026-08-17
updated: 2026-08-17
---
# Sätteri

Astro 7 からデフォルトになった Markdown / MDX プロセッサ。パースとコンパイルは Rust で行い、プラグインは JavaScript で書く。unified（remark / rehype）とは別系統だが、mdast と hast という AST の形は共有している。

Astro 7 で `markdown.remarkPlugins` を設定するとエラーになり、`@astrojs/markdown-remark` を入れて `processor: unified({...})` を明示するよう促される。remark を使い続けることはできるが、既定の道からは外れる。

## プラグインの形

ノードの型名をキーにしたビジターを持つオブジェクトを定義する。

```ts
import { defineMdastPlugin } from 'satteri'

export const mermaid = defineMdastPlugin({
  name: 'mermaid',
  code(node) {
    if (node.lang !== 'mermaid') return
    return { rawHtml: `<div class="mermaid">${escapeHtml(node.value)}</div>` }
  },
})
```

Astro 側では `satteri()` に渡す。

```ts
import { satteri } from '@astrojs/markdown-satteri'

export default defineConfig({
  markdown: {
    processor: satteri({ mdastPlugins: [noteTitle, mermaid, noteLinks] }),
  },
})
```

ビジターは値を返すとそのノードを置換でき、`ctx` からは `removeNode` `insertBefore` `insertAfter` `replaceNode` `wrapNode` `setProperty` `parent` `indexOf` `textContent` などが使える。unist-util-visit で親の children を splice していた処理は、だいたい ctx のメソッドに置き換わる。

## raw / rawHtml はブロックとして扱われる

ここでかなり時間を溶かした。ビジターが返せる値は `MdastNode | { raw: string } | { rawHtml: string }` で、`raw` は Markdown、`rawHtml` は生 HTML のエスケープハッチ。**インライン位置の text ノードをこれで置換すると、ブロックとして解釈されて `<p>` が挿入される。**

```
--- return raw ---
<p>aaa <code>code</code><p>bbb<a href="/z">LINK</a>ccc</p><strong>strong</strong></p>
```

段落の中に段落が生まれてしまっている。インラインのまま複数ノードに分割したいなら、宣言的な mdast ノードの配列を `insertBefore` して元のノードを `removeNode` する。

```ts
text(node, ctx) {
  const parts = buildParts(node.value) // [{type:'text'}, {type:'link'}, ...]
  if (!parts) return
  ctx.insertBefore(node, parts)
  ctx.removeNode(node)
}
```

これなら期待どおりインラインで展開される。

```
--- insertBefore ---
<p>aaa <code>code</code> bbb<a href="/x">LINK</a>ccc <strong>strong</strong></p>
```

`data.hProperties` も効くので、生成した link ノードに `class` を付けられる。

```quiz
Sätteri のビジターが `{ raw }` や `{ rawHtml }` を返すと、インライン位置の text ノードはどうなるか。
---
ブロックとして解釈され、段落の中に `<p>` が入れ子で生成される。インラインのまま分割するには、宣言的な mdast ノードの配列を `insertBefore` して元のノードを `removeNode` する。
```

なお、コードブロックとインラインコードは別のノード型なので、text ノードだけを見ているぶんには `#include` のような記述を誤って拾う心配がない。これは remark でも同じだが、AST を触る方式の素直な利点。

## プラグインの変更が効かないときはキャッシュを疑う

プラグインを書き換えたのに出力が変わらない、という状況に一度はまった。`.astro` を消しても直らず、`node_modules/.astro` と `node_modules/.vite` まで消してようやく反映された。設定ファイル経由で読み込まれるプラグインは Vite 側にキャッシュされる。

```sh
rm -rf .astro node_modules/.astro node_modules/.vite dist
```

```quiz
Markdown プラグインを書き換えたのに出力が変わらない。`.astro` を消しても直らないとき、次に消すのはどこか。
---
`node_modules/.astro` と `node_modules/.vite`。設定ファイル経由で読まれるプラグインは Vite 側にキャッシュされる。
```

## シンタックスハイライト

Astro が組み込みのハイライトプラグインを挿すので、`markdown.shikiConfig` はそのまま効く。デュアルテーマ + `defaultColor: false` にすると CSS 変数だけが出力されるが、`<pre>` に付くクラスは `.shiki` ではなく **`.astro-code`**。

```css
.astro-code { color: var(--shiki-light); background-color: var(--shiki-light-bg); }
[data-theme='dark'] .astro-code { color: var(--shiki-dark); background-color: var(--shiki-dark-bg); }
```

[[astro-hono-adapter|Astro の Hono アダプタ]]と組み合わせて使っている。

## 出典

- [satteri のドキュメント](https://satteri.bruits.org/docs/)
- `node_modules/satteri/dist/mdast/mdast-visitor.d.ts` — ctx の API とビジターの一覧
- `node_modules/@astrojs/markdown-satteri/dist/processor.d.ts` — `satteri()` に渡せるオプション

#astro #markdown #rust
