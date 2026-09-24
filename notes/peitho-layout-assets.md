---
created: 2026-09-24
updated: 2026-09-24
title: peitho のレイアウトが参照するファイルは名指ししたものだけが届く
description: peitho v1.34.0 はレイアウトが直接参照するファイルをハッシュ付きの名前に書き換えて配信するが、そこから相対 import されるファイルは届かない。
tags: [peitho, slides, vite]
---
# peitho のレイアウトが参照するファイルは名指ししたものだけが届く

[[peitho]] v1.34.0 は、`layouts/*.html` に直接書いたファイル参照（`<video src>`・`poster`・`<script src>`・`href` など）をビルド時に解決する。Markdown の画像と同じ扱いになり、`assets/<16桁のハッシュ>-<ファイル名>` という名前に書き換えてコピー・配信される。v1.34.0 と BarefootJS の overview デッキで確かめた範囲。

```html
<!-- layouts/cover.html に書いたもの -->
<source src="assets/hero.mp4" type="video/mp4">
<script type="module" src="assets/mount.js"></script>
<!-- 出力されるスライドの HTML -->
<source src="assets/651e943aa70a461a-hero.mp4" type="video/mp4">
<script type="module" src="assets/1ff9533299705c82-mount.js"></script>
```

- 外部 URL（`http:`・`https:`・`//`）、`data:`、`#` だけの参照は対象外。
- ファイルが無いとビルドが止まる。エラーにはどのレイアウトのどの要素・属性か（`<video src="…"> in layout 'cover'`）が出る。
- 動画は Range リクエストに応える形で配信される。WebKit の `<video>` は Range が効かないと再生を始めない。

## 名指ししていないファイルは届かない

コピー・配信されるのは、レイアウトに書かれたファイルだけ。そのファイルがさらに相対パスで読み込むものは含まれない。

vite のビルドは、エントリ（`mount.js`）を共有ランタイムや各コンポーネントの chunk に分け、`import "./index-XXXX.js"` のように相対パスで読み込む。レイアウトが名指しするのは `mount.js` だけなので、次のようになった。

- `peitho present`: `assets/<hash>-mount.js` は 200 で返るが、そこからの `./index-XXXX.js` は 404。モジュールの読み込みごと失敗し、コンポーネントが一つも動かない。
- `peitho build`: 出力の `assets/` にはハッシュ付きの `mount.js`・`hero.mp4`・`hero.jpg` しか入らない。

対処として、`vite build` のあとに `bun build dist/mount.js --format esm --minify --outfile assets/mount.js` をかけ、import を持たない 1 ファイルにまとめた。1 つのモジュールグラフとしてまとめるので、ランタイムは 1 つにまとまり、コンポーネントの登録とマウントが別々のランタイムに分かれることもない。

### ビルドの順序も変わる

参照先が無いとビルドが止まるので、レイアウトが参照するファイルを生成しているなら、`peitho build` より前に生成しておく必要がある。overview デッキは `assets/*.js` を git に入れていないので、コンポーネントのビルドを先に回した。

### 同じファイルを別の名前で読まない

配布ビューアでもレイアウトの `<script>` が動くようになったので（[[peitho-layout-scripts]]）、`index.html` の `<head>` に `assets/mount.js` を差し込む従来の方法をそのまま残すと、`assets/mount.js` と `assets/<hash>-mount.js` の 2 つが読まれる。URL が違えば別のモジュールとして評価されるので、差し込みはやめた。

## 自前のサーバーで配信するときに踏んだもの

Peitho Studio は peitho-core を組み込み、自前の小さな HTTP サーバーでアセットを返している。レイアウトのアセットを Markdown の画像と同じ経路で返すようにしたところで、2 つの問題が出た。

- 解決済みアセットの表は `assets/<hash>-<name>` を丸ごとキーにしているのに、`assets/` を剥がした名前で引いていて、全部 404 になっていた。単体テストが同じく剥がした形のキーで表を手作りしていたので気づけなかった。実際のレンダリング結果をそのままサーバーに通すテストで検出できるようになった。
- Content-Type を画像用の表だけで決めていたので、`.js` が `application/octet-stream` で返っていた。classic script と違い、`type="module"` は JavaScript の MIME でないと実行を拒否される（`'application/octet-stream' is not a valid JavaScript MIME type`）。

## 理解度チェック

```quiz
レイアウトが `<script type="module" src="assets/mount.js">` を書き、`mount.js` が `./index-XXXX.js` を import している。`peitho present` で何が起きるか?
---
`assets/<hash>-mount.js` は届くが `./index-XXXX.js` は 404 になり、モジュールごと失敗する。peitho が配信するのはレイアウトが名指ししたファイルだけだから。
```

```quiz
`index.html` で `assets/mount.js` を読み、レイアウトの `<script>` でも同じファイルを読むと、v1.34.0 では何が問題になるか?
---
レイアウト側は `assets/<hash>-mount.js` に書き換わるので URL が異なり、同じコードが 2 つの別モジュールとして評価される。
```

```quiz
`<script src>` のファイルを間違った Content-Type で返したとき、classic script と module script で結果はどう違うか?
---
module script は JavaScript の MIME 以外を厳格に拒否して実行されない。classic script はこの検査が緩い。
```

## 出典

- [mizzy/peitho#529](https://github.com/mizzy/peitho/issues/529) と v1.34.0 の `crates/peitho-core/src/layout.rs`（`LayoutAssets`）、`crates/peitho/src/main.rs`（`resolve_layout_assets`）
- [piconic-ai/barefootjs#3145](https://github.com/piconic-ai/barefootjs/pull/3145) — `site/core/scripts/build-slides.ts` の順序変更と `mount.js` の 1 ファイル化
- [piconic-ai/peitho-studio#73](https://github.com/piconic-ai/peitho-studio/pull/73) — Studio のアセット配信の修正

#peitho #slides #vite
