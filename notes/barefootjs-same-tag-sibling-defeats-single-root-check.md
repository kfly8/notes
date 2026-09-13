---
created: 2026-09-13
updated: 2026-09-13
title: "BarefootJS: 同じタグ名の兄弟要素がisSingleRootElementの単一root判定を欺く"
description: BarefootJS のコンパイラが三項演算子cond ?
tags: [barefootjs, reactivity]
---
# BarefootJS: 同じタグ名の兄弟要素がisSingleRootElementの単一root判定を欺く

[[barefootjs]] のコンパイラが三項演算子`cond ? A : B`の各分岐を`bf-c`属性方式(単一要素)にするか`<!--bf-cond-start-->`コメントマーカー方式(複数要素/fragment)にするか決める`isSingleRootElement`(`packages/jsx/src/ir-to-client-js/html-template.ts`)が、分岐の最初と最後の要素がたまたま**同じタグ名**だと、複数要素の分岐を単一rootと誤判定する。これが[[barefootjs-mismatched-branch-shape-drops-siblings]]で観測された「非対称な三項演算子が兄弟要素を静かに失う」症状の実際のコンパイラ側の原因だった。

## 元の実装の問題

```ts
function isSingleRootElement(html: string): boolean {
  const match = html.match(/^<(\w+)[\s>]/)
  if (!match) return false
  const tag = match[1]
  if (/^<\w+[^>]*\/>$/.test(html.trim())) return true
  // 最後がその閉じタグで終わっているかだけを見る
  const closingPattern = new RegExp(`</${tag}>\\s*$`)
  return closingPattern.test(html.trim())
}
```

「文字列の末尾が、開始タグと同じタグ名の閉じタグで終わっているか」しか見ていない。`<div id="before">before</div><div id="after">after</div>`のような**2つの`<div>`の兄弟**を渡すと、末尾は確かに`</div>`で終わっているので`true`を返す——ただしそれは2つ目の、無関係な`div`の閉じタグ。ネストの深さを一切追跡していないので、単一rootとの区別がつかない。

`addCondAttrToTemplate`はこの判定が`true`だと最初の要素にだけ`bf-c="<id>"`を付け、コメントマーカーを出さない。結果、`insert()`のランタイムは`isFragmentCond: false`と判断して`updateElementConditional`(`fragment.firstChild`しか見ない関数)に流れ、2つ目以降の要素は静かに捨てられる——という経路は[[barefootjs-mismatched-branch-shape-drops-siblings]]で確認済みの通り。

## 修正: タグの深さを追跡する

「文字列の末尾」ではなく、トップレベルのタグを順に見てネストの深さが0に戻る位置が文字列の末尾と一致するかで判定するように書き換えた。

```ts
const tagPattern = /<!--[\s\S]*?-->|<\/?[^\s/>]+[^>]*>/g
let depth = 0
let tagMatch: RegExpExecArray | null
while ((tagMatch = tagPattern.exec(trimmed))) {
  const raw = tagMatch[0]
  if (raw.startsWith('<!--')) continue // コメントはタグではない
  if (raw.endsWith('/>')) {
    if (depth === 0) return tagPattern.lastIndex === trimmed.length
    continue
  }
  depth += raw.startsWith('</') ? -1 : 1
  if (depth === 0) {
    return tagPattern.lastIndex === trimmed.length
  }
}
return false
```

修正の前後で、既存の全パターン(単一要素・自己終了タグ・カスタム要素タグなど)の出力が完全に同一になることを、実際に両実装を並べて全ケースを突き合わせて確認した。挙動が変わったのは「末尾が同じタグ名の兄弟要素を持つ多要素分岐」という、まさにバグだったケースだけ。

## 書き換える過程で2回踏んだ落とし穴

素朴な「タグらしき`<...>`を全部拾う」正規表現では足りず、実装を進める中で2つの回帰を自分で作って自分で踏んだ。

**1回目: コメントマーカーをタグとして誤カウント**

BarefootJSは反応的なテキストスロットを`<!--bf:s1-->...<!--/-->` のようなコメントで囲んで表現する。単一rootの中にこのマーカーがあると、`<!--bf:s1-->`は`<`で始まり`>`で終わる文字列なので、コメントを除外しないタグパターンにマッチしてしまい、開始タグとして深さを1つ余分に増やしてしまう。結果、本来単一rootのはずの分岐が「深さが0に戻らない」と誤判定されてコメントマーカー方式に倒れた。ドキュメント例`count() > 0 ? <p>{count} items</p> : <p>No items</p>`のスナップショットが変わったことで発覚した。対策は上のコードにある通り、コメント全体`<!--[\s\S]*?-->`を最初の選択肢に置き、タグより先にマッチさせて素通りさせること。

**2回目: 自己終了タグ+兄弟要素を単一rootと誤判定**

`<input .../><label>...</label>`(TodoAppの「toggle all」分岐、自己終了要素の後に別要素が続く)のような、深さ0のまま自己終了タグを無条件で読み飛ばす実装だと、`<input/>`を素通りしてから`<label>`だけを見てしまい、2つが1つの単一rootであるかのように判定してしまう。原因は「深さ0で自己終了タグに出会うことはない」という思い込み——ゲート`/^<(\w+)[\s>]/`はタグ名の直後の1文字(空白か`>`)しか見ておらず、そのタグが後で`/>`で自己終了するかどうかまでは判定していない。`<input id="..." ...`は空白から始まるのでゲートを通り、実際には自己終了タグなのにチェックをすり抜ける。この回帰は`generate-expected-html.ts`によるfixtureドリフト検査(`todo-app`フィクスチャ)がCI上で検出した——ローカルでは`@barefootjs/client`がビルドされておらずこのチェック自体が無音で失敗していたため、最初は見逃していた。対策は「深さ0での自己終了タグも、他のタグの閉じ位置と同様に単一root判定の対象にする」こと。

## 理解度チェック

```quiz
元の`isSingleRootElement`はどういう基準で「単一rootかどうか」を判定していたか、何がその基準の弱点だったか。
---
文字列の末尾が、開始タグと同じタグ名の閉じタグで終わっているかだけを見ていた。ネストの深さを追跡しないので、`<div>...</div><div>...</div>`のように同じタグ名の兄弟が2つ続く場合、2つ目の無関係な閉じタグに騙されて単一rootと誤判定する。
```

```quiz
深さ追跡に書き換えた際、最初に踏んだ回帰は何が原因だったか。
---
BarefootJSの反応的スロットのマーカーコメント(`<!--bf:s1-->`など)を、コメントとして除外せずにタグパターンでマッチさせてしまい、開始タグとして深さを誤って増やしていたこと。
```

```quiz
2つ目に踏んだ回帰(`<input/><label>...</label>`のような形)は何が原因だったか。
---
深さ0で自己終了タグに出会うことは無いという思い込みで、自己終了タグを無条件に読み飛ばす実装にしていたため。実際にはタグ名ゲートはタグ名の直後の1文字しか見ておらず、後で`/>`になるかどうかは判定していないので、自己終了タグの直後に別要素が続く2要素の分岐を単一rootと誤判定した。
```

## 出典

- `packages/jsx/src/ir-to-client-js/html-template.ts`(`piconic-ai/barefootjs`、2026-09-13時点の`main`)。修正前は commit `1cd0b8e`、修正後は同ファイルの現行版。
- [piconic-ai/barefootjs#2960](https://github.com/piconic-ai/barefootjs/issues/2960)(issue) / [piconic-ai/barefootjs#2961](https://github.com/piconic-ai/barefootjs/pull/2961)(修正PR、マージ済み)

#barefootjs #reactivity
