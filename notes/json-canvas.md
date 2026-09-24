---
created: 2026-09-24
updated: 2026-09-24
title: JSON Canvas
description: 無限キャンバスに置いた箱（ノード）と線（エッジ）を JSON で持つ、オープンなファイル形式。
tags: [json-canvas, obsidian, diagram, file-format]
---
# JSON Canvas

無限キャンバスに置いた箱（ノード）と線（エッジ）を JSON で持つ、オープンなファイル形式。Obsidian の Canvas 機能の保存形式を、2024年3月11日に独立した仕様として公開したもの。MIT ライセンスで、どのアプリも読み書きの形式として自由に実装してよい。仕様は v1.0 で、告知では意図的に最小限の内容から始め、今後育てていく方針が述べられている。

公開の理由として Obsidian が挙げているのは、データを自分の手元にオープンな形式で持つという方針（File over app）。キャンバスアプリで作ったものを、アプリの外でも長く読めるようにするための形式、という位置づけ。

## 形式

トップレベルは `nodes` と `edges` の2つの配列で、どちらも省略できる（空のキャンバスも正しいファイル）。

```json
{
  "nodes": [
    {"id": "a", "type": "text", "x": 0, "y": 0, "width": 180, "height": 40, "text": "機能ブランチの PR", "color": "4"},
    {"id": "b", "type": "text", "x": 220, "y": 90, "width": 180, "height": 40, "text": "プレビュー"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "a", "fromSide": "right", "toNode": "b", "toSide": "top", "label": "作成"}
  ]
}
```

このサイトでは、同じ JSON を ` ```canvas ` のブロックに書くと次のように描かれる。

```canvas
{
  "nodes": [
    {"id": "a", "type": "text", "x": 0, "y": 0, "width": 180, "height": 40, "text": "機能ブランチの PR", "color": "4"},
    {"id": "b", "type": "text", "x": 220, "y": 90, "width": 180, "height": 40, "text": "プレビュー"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "a", "fromSide": "right", "toNode": "b", "toSide": "top", "label": "作成"}
  ]
}
```

### ノード

すべてのノードが `id`・`type`・`x`・`y`・`width`・`height` を持つ。座標と大きさは整数（ピクセル）。`color` は省略できる。

`type` は4種類で、それぞれ固有のフィールドを持つ。

- `text`: `text`（必須）に Markdown を含むテキストを持つ。
- `file`: `file`（必須）にファイルへのパスを持つ。`subpath` は `#` で始まる見出しやブロックへのリンク。
- `link`: `url`（必須）に URL を持つ。
- `group`: 他のノードをまとめる枠。`label`、背景画像の `background`、その敷き方の `backgroundStyle`（`cover` / `ratio` / `repeat`）を持てる。

重なり順は配列の順番で決まる。先に書いたノードほど下に描かれる。

### エッジ

`id`・`fromNode`・`toNode` が必須。

| フィールド | 値 | 既定 |
| --- | --- | --- |
| `fromSide` / `toSide` | `top` / `right` / `bottom` / `left` | 指定なし |
| `fromEnd` | `none` / `arrow` | `none` |
| `toEnd` | `none` / `arrow` | `arrow` |
| `label` | 文字列 | なし |
| `color` | 色 | なし |

### 色

`"#FF0000"` のような16進数か、プリセットの `"1"`〜`"6"`（赤・橙・黄・緑・シアン・紫）。プリセットの具体的な色は、アプリが合わせられるように**わざと決められていない**。

## 仕様が決めていないこと

描画を実装してみると、次のことは仕様に書かれておらず、描画する側が決めることになる。

- **線の経路。** `fromSide` / `toSide` は線が出入りする辺を決めるだけで、直線で結ぶのか、直角に折るのか、曲線にするのかは書かれていない。
- **線の種類。** 点線や太さを指定するフィールドは無い。
- **独自フィールドの扱い。** 仕様にも公式サイトにも、未知のフィールドを無視すべきかどうかの記述は見当たらない。独自の拡張を足すと、他のアプリでは黙って無視されるか、壊れたファイル扱いになるかは実装しだいになる。
- **テキストの描画。** `text` は Markdown を含むとされているが、どこまでの記法を描くかは決まっていない。
- **プリセット色の実際の色。**

## 図の記法として見たとき

mermaid のような記法は、ノードと関係だけを書き、配置と配線はレイアウトエンジンが決める。書くのは速いが、見た目を指定できない。このサイトで mermaid を使っていたときは、次のことができなかった。

- 箱の幅が文字数で決まり、そろわない
- 分岐した線を「右へ出て一度だけ下に折れる」形にできない。mermaid の block-beta は線を始点・中点・終点の3点で結ぶので、折れ線にすると必ず2回曲がる

JSON Canvas は座標と大きさ、線の出入りする辺をデータとして持つので、こうした形の問題が起きない。その代わり、配置は人（またはキャンバスアプリの GUI）が決める必要があり、座標を含むぶん差分も読みにくい。1ノードを1行に書けば、変更は行単位の差分で追える。

## notes.kobaken.co での描画

このサイトでは、` ```canvas ` のブロックをビルド時に SVG にしている（`src/plugins/canvas.ts`）。仕様が決めていない部分は、次のように決めた。

- **線の経路**: 出る辺と入る辺の向きが違えば一度だけ折れる（L 字）。向きが同じなら中間で二度折れ、同じ辺どうし（下から下など）は外へ張り出してコの字に回る。
- **ラベルの位置**: 相手に入っていく側の線に載せる。二度折れる線とコの字では中央の線に載せる。
- **付く位置**: 1つの辺に矢印の先が集まるときは、付く位置を辺の上で等間隔にずらす。出ていくだけの線は1点に集めて、そこから枝分かれさせる。
- **点線**: 独自の拡張 `"style": "dashed"` で描く。上に書いたとおり、他のアプリがこのフィールドをどう扱うかは分からない。
- **色**: SVG には色を書かず、CSS 変数で塗る。プリセット `"4"` をサイトのアクセント色に割り当てて、テーマの切り替えに追従させている。
- **重なり順**: グループを先に、他のノードを後に描く。仕様では配列の順番で決まるので、ここは仕様から外れている。

実際の図は [[tagpr-workers-builds-release-flow]]（分岐）、[[mcp-v2]]（グループと往復）、[[tauri-sync-command-blocks-repaint]]（グループをレーンにしたシーケンス）などにある。

## 対応しているアプリとライブラリ

公式の一覧（`docs/apps.md`）には、Obsidian のほか Kinopio、Flowchart Fun、hi-canvas、OrgPad、Charkoal、Ideaflip が挙がっている。対応の度合いは、読み込みだけ・書き出しだけなどアプリによって違う。Heptabase からの変換ツールや、mermaid への書き出しツールもある。ライブラリは Dart、Go、Python、React、Ruby、Rust、TypeScript、Vue などの実装がある。

## 理解度チェック

```quiz
エッジに `fromSide: "right"` と `toSide: "top"` を指定した。線がどんな経路を通るかは、仕様で決まっているか。
---
決まっていない。仕様が決めるのは線が出入りする辺だけで、直線か折れ線かなどの経路は描画する側が決める。
```

```quiz
プリセット色 `"4"` は、どのアプリでも同じ緑で描かれるか。
---
描かれるとは限らない。プリセットの具体的な色は、アプリが合わせられるようにわざと決められていない。
```

```quiz
mermaid では箱の幅がそろわなかったのに、JSON Canvas ではそろえられるのはなぜか。
---
mermaid はレイアウトエンジンが文字数から箱の大きさと配置を決めるが、JSON Canvas は `width` / `height` と座標をデータとして持つため。
```

## 出典

- [Announcing JSON Canvas: an open file format for infinite canvas data - Obsidian](https://obsidian.md/blog/json-canvas/)
- [JSON Canvas Spec 1.0](https://jsoncanvas.org/spec/1.0/)
- [obsidianmd/jsoncanvas - GitHub](https://github.com/obsidianmd/jsoncanvas)
- [JSON Canvas support（docs/apps.md）](https://github.com/obsidianmd/jsoncanvas/blob/main/docs/apps.md)

#json-canvas #obsidian #diagram #file-format
