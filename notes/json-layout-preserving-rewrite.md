---
created: 2026-09-29
updated: 2026-10-07
title: JSON を構造から書き戻しても、元のファイルと1バイトも変えない
description: パースした JSON を構造として編集し、ファイルに書き戻す場面で、変えていない部分を元のまま保つ方法。
tags: [json, json-canvas, obsidian, go]
---
# JSON を構造から書き戻しても、元のファイルと1バイトも変えない

パースした JSON を構造として編集し、ファイルに書き戻す場面で、変えていない部分を元のまま保つ方法。そのまま `JSON.stringify` し直すと、字下げ・キーの順序・数値の書き方がすべて書き手のものに置き換わり、1か所の変更でもファイル全体の差分になる。ima（現在の [[pedit]]）で [[json-canvas]] を構造として共有したとき（[[json-canvas-co-editing-text-or-structure]]）、ホストのファイルを他のアプリ（Obsidian）でも開いたまま使えるようにするために必要になった。

## Obsidian が書く形

Obsidian 公式のサンプル（`obsidianmd/jsoncanvas` の `sample.canvas`）はこう書かれている。

```json
{
	"nodes":[
		{"id":"754a8ef995f366bc","type":"group","x":-300,"y":-460,"width":610,"height":200,"label":"JSON Canvas"},
		{"id":"8132d4d894c80022","type":"file","file":"readme.md","x":-280,"y":-200,"width":570,"height":560,"color":"6"}
	],
	"edges":[
		{"id":"6fa11ab87f90b8af","fromNode":"7efdbbe0c4742315","fromSide":"right","toNode":"59e896bc8da20699","toSide":"left"}
	]
}
```

- 字下げはタブ。ノードとエッジは1つを1行に、スペースなしで書く。
- ノードのキーは `id`、`type`、`text`／`file`／`url`、`x`、`y`、`width`、`height` の順で、`color` と `label` は `height` の後ろに付く。エッジは `id`、`fromNode`、`fromSide`、`toNode`、`toSide` の順。
- 空の配列は `"edges":[]`。ファイル末尾に改行はない。

## 書き戻し方

ima の `internal/canvas` は、読み込んだときの情報を残しておき、書き戻しに使う。

1. **変わっていないものは元の文字列のまま出す。** 要素ごと・フィールドごとに、読み込んだときの元の文字列（raw）と値を持っておく。書き戻す値が読み込んだ値と等しければ、raw をそのまま出す。数値は型を問わず値で比べる（`1.0` と `1` は等しい）。
2. **変わった要素も、キーの順序は元のまま。** 元にあったキーは元の順で並べ、新しいキーは上の Obsidian の順、未知のキーはその後ろに名前順で足す。
3. **字下げの流儀はファイルから当てる。** 候補（Obsidian の形、2スペース・4スペース・タブの整形）ごとに、読み込んだ内容をその流儀で書き出してみて、元のファイルと完全に一致したものを採る。末尾の改行の有無も元に合わせる。どれにも一致しないファイルは、最初の書き込みで一度だけ Obsidian の形にそろう。

こうすると、読み込んだファイルを何も変えずに書き戻せば、1バイトも変わらない。Obsidian のサンプルは、内容を空の状態から書き出しても（上の 2・3 の規則だけで）Obsidian が書いたものと一致した。

例外として、`nodes` も `edges` もないファイル（`{}` や空のファイル）には、Obsidian と同じく両方の配列を足して書く。

## 構造の側ではキーの順序を覚えられない

キーの順序を構造の中（Y.Map）に持たせることはできない。Y.Map のキーの並びは、ピアをまたいで保証されない。Go の ygo では `YMap.Keys()` の返す順序が呼ぶたびに違った（[[ygo-yjs-nested-types]]）。だから順序は、ファイルを読み書きする側（ホスト）が、最後に読んだファイルを覚えておいて決める。

## 理解度チェック

```quiz
変わっていないノードを書き戻すとき、`JSON.stringify` し直さずに何を出すか。
---
読み込んだときの元の文字列（raw）。値が読み込み時と等しいかを比べ、等しければ raw をそのまま出す。
```

```quiz
字下げの流儀（Obsidian の1行1ノードか、整形済みか）をどう決めるか。
---
候補の流儀ごとに読み込んだ内容を書き出してみて、元のファイルと完全に一致したものを採る。
```

```quiz
キーの順序を Y.Map に覚えさせず、ホストが決めるのはなぜか。
---
Y.Map のキーの並びはピアをまたいで保証されず、ygo の `Keys()` は呼ぶたびに順序が違ったから。
```

## 出典

- [obsidianmd/jsoncanvas の sample.canvas](https://github.com/obsidianmd/jsoncanvas/blob/main/sample.canvas)
- [piconic-ai/ima#45](https://github.com/piconic-ai/ima/pull/45)（`internal/canvas` の読み書き）

関連: [[pedit-development-notes]]

#json #json-canvas #obsidian #go
