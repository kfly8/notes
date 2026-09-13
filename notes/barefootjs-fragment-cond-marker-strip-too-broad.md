---
created: 2026-09-13
updated: 2026-09-13
title: "BarefootJS: updateFragmentConditionalのマーカー剥がしが広すぎてネストした子自身のマーカーまで消す"
description: BarefootJS のinsert()(条件分岐のDOM更新を担うランタイム)が、分岐を切り替えるたびにupdateFragmentConditional(packages/client/src/runtime/insert.ts)で新しいHTMLをDOM上の永続マーカー<!--bf-cond-start:id-->〜<!--bf-cond-end:id-->の間に差し込む際、フィルタが広すぎて…
tags: [barefootjs, reactivity, hydration]
---
# BarefootJS: updateFragmentConditionalのマーカー剥がしが広すぎてネストした子自身のマーカーまで消す

[[barefootjs]] の`insert()`(条件分岐のDOM更新を担うランタイム)が、分岐を切り替えるたびに`updateFragmentConditional`(`packages/client/src/runtime/insert.ts`)で新しいHTMLをDOM上の永続マーカー`<!--bf-cond-start:id-->`〜`<!--bf-cond-end:id-->`の間に差し込む際、フィルタが広すぎて**ネストした子コンポーネント自身の条件分岐マーカー**まで一緒に消してしまうことがある。これが[[barefootjs-nested-fragment-child-unregistered-scope]]で観測された「祖先の三項演算子が切り替わった後、その中の子コンポーネント自身の条件分岐が二度とDOM更新されない」症状の実際の原因だった——ただし同ノートが立てた仮説(`commentScopeRegistry`未登録)は、深掘りした結果**外れ**だったと分かった。

## 前提: 分岐テンプレートは自分自身のマーカーを毎回埋め込む

コンパイラの`addCondAttrToTemplate`(→[[barefootjs-same-tag-sibling-defeats-single-root-check]])は、fragment形式の分岐(複数要素やコンポーネントを返す分岐)を常に`<!--bf-cond-start:id--><実際の内容><!--bf-cond-end:id-->`で包んでテンプレート文字列を生成する。これはDOM上に**すでにある**永続マーカーとは別の、テンプレート文字列の中に静的に焼き込まれた冗長なコピー。`updateFragmentConditional`は新しいHTMLをパースしたら、この冗長な自分自身のラッパーだけを取り除いて中身だけを実マーカーの間に差し込む必要がある。

## 元の実装: プレフィックス一致で広く消しすぎる

```ts
let child = fragment.firstChild
while (child) {
  const next: ChildNode | null = child.nextSibling
  if (!(child.nodeType === 8 && child.nodeValue?.startsWith('bf-cond-'))) {
    startComment!.parentNode?.insertBefore(child, endComment)
  }
  child = next
}
```

「値が`bf-cond-`で始まるコメントノードなら移動しない」という**プレフィックス一致**でフィルタしていた。これは今の分岐(id)自身の`bf-cond-start:id`/`bf-cond-end:id`だけでなく、パース結果の中に含まれる**別のid**の`bf-cond-*`コメントも無差別に弾いてしまう。

fragmentRootな子コンポーネント(単一のラップ要素を持たず`<>...</>`を返すもの)を`t && initChild(name, t, props)`という普通の経路で親の分岐の中に直接マウントすると、その子自身が持つ`{errorMessage ? <div>...</div> : null}`のようなconditionalの`<!--bf-cond-start:childId-->`/`<!--bf-cond-end:childId-->`は、子の他の出力(`<footer>`など)と**同じ階層のトップレベル要素**として現れる。親の分岐を丸ごとパースしたfragmentの中では、これらは区別なく「`bf-cond-`で始まるコメント」に見えるため、親の分岐が差し替えられるたびに**DOMから完全に消される**。マーカーが跡形もなく消えた後では、子自身の`insert()`が次に自分の`bf-cond-start:childId`を探しても永久に見つからず、無音でno-opし続ける。

## 事前の仮説が外れていた理由

[[barefootjs-nested-fragment-child-unregistered-scope]]は「子コンポーネントの`insert()`に渡る`scope`(`t`)が`commentScopeRegistry`に登録されていないから、マーカー探索が`scope`のサブツリーに限定されて見つからない」という仮説を立てていた。実際にソースを追って確認すると、`$c(__branchScope, slotIdOrName)`(`query.ts`)がfragmentRootな子を解決する経路には`findCommentChildScope`という関数があり、これが`commentScopeRegistry.set(proxyEl, ...)`をきちんと呼んでいた——つまり登録自体は正しく行われている。実際の欠陥は登録の有無ではなく、その手前で**マーカー自体がDOMから消されている**ことだった。登録が正しくても、探す対象のコメントノードがそもそも存在しなければ見つかりようがない。

## 修正: 自分自身のラッパーだけを、値の完全一致で剥がす

```ts
if (fragment.firstChild?.nodeType === 8 && fragment.firstChild.nodeValue === startMarker) {
  fragment.removeChild(fragment.firstChild)
}
if (fragment.lastChild?.nodeType === 8 && fragment.lastChild.nodeValue === endMarker) {
  fragment.removeChild(fragment.lastChild)
}
```

パースしたfragmentの**文字通り最初と最後の子ノード**だけを対象にし、しかも値が今の分岐自身の`bf-cond-start:id`/`bf-cond-end:id`と**完全一致**する場合に限って取り除く。`addCondAttrToTemplate`が分岐のHTML全体をラッパーで包む実装である以上、自分自身のマーカーは常に「パース結果のfirstChildとlastChild」に来るという不変条件に乗った修正で、他のidを持つコメント(ネストした子自身のマーカーを含む)には一切触れない。

## 理解度チェック

```quiz
なぜ子コンポーネント自身の条件分岐マーカーが、親の分岐の更新のたびに消えてしまっていたのか。
---
`updateFragmentConditional`の古いフィルタが「値が`bf-cond-`で始まるコメントかどうか」というプレフィックス一致で判定していたため、今の分岐自身のマーカーだけでなく、パース結果に含まれる別id(ネストした子自身の条件分岐)のマーカーまで無差別に取り除いていたから。
```

```quiz
「`commentScopeRegistry`に子のscopeが登録されていない」という事前の仮説はなぜ間違っていたか。
---
実際には`$c()`が呼ぶ`findCommentChildScope`(query.ts)がfragmentRootな子のscopeを`commentScopeRegistry`に正しく登録していた。問題は登録の有無ではなく、探す対象のマーカーコメント自体がDOMから消されていたこと。
```

```quiz
修正後はどういう条件でマーカーコメントを取り除くようにしたか。
---
パースしたfragmentの文字通り最初と最後の子ノードだけを対象にし、その値が今の分岐自身の`bf-cond-start:id`/`bf-cond-end:id`と完全一致する場合に限って取り除くようにした。
```

## 出典

- `packages/client/src/runtime/insert.ts`・`packages/client/src/runtime/query.ts`(`piconic-ai/barefootjs`、2026-09-13時点の`main`)。修正前は commit `1cd0b8e`、修正後は同ファイルの現行版。
- [piconic-ai/barefootjs#2959](https://github.com/piconic-ai/barefootjs/issues/2959)(issue) / [piconic-ai/barefootjs#2962](https://github.com/piconic-ai/barefootjs/pull/2962)(修正PR、マージ済み)

#barefootjs #reactivity #hydration
