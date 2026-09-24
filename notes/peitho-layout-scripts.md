---
created: 2026-09-24
updated: 2026-09-24
title: peitho のレイアウトに書いた script 要素を動かす
description: peitho v1.34.0 でレイアウトの <script> が実行されるようになった仕組みと、スクリプトが Shadow DOM の中の自分のスライドを peitho:shadow-mounted とバックログ配列で見つける方法。
tags: [peitho, shadow-dom, slides]
---
# peitho のレイアウトに書いた script 要素を動かす

[[peitho]] v1.34.0 から、`layouts/*.html` に書いた `<script>` が present・preview・build（配布ビューア）の各ビューアで実行される。それまでは書いても何も起きなかった。このノートの内容は v1.34.0 と、それに合わせた BarefootJS の overview デッキ・Peitho Studio で動かして確かめた範囲。

## なぜ書いても動かなかったか

ビューアはスライドの HTML を `innerHTML`（`template.innerHTML` を含む）で差し込む。HTML の仕様では、`innerHTML` でパースされた `<script>` には「実行済み」の印が付く。そのため、あとで接続し直しても実行されない。エラーも出ない。

v1.34.0 のビューアは、差し込んだあとで各 `<script>` を `createElement` で作り直して置き換える（`executeInlineScripts`）。作り直した要素には印が付いていないので実行される。

- 属性はそのままコピーする。
- `src` のない classic script だけは本文を IIFE で包む。classic script はすべて 1 つのグローバルスコープを共有するので、同じレイアウトのスライドが 2 枚あったり、配布ビューアのようにページ送りのたびに差し込み直したりすると、トップレベルの `let`/`const` が "already declared" で落ちるため。
- `type="module"`・`src` 付き・`application/json` のような非 JS は包まない。

## スクリプトが自分のスライドを見つける方法

present と preview は各スライドを別々の Shadow DOM に入れる。`document.querySelectorAll` も `MutationObserver` も shadow root の中には届かないので、スクリプト側からスライドの DOM を探す手段がない。

そこでビューアが、スライドをマウントするたびに次の 2 つを行う。

- host から `peitho:shadow-mounted` を発火する。`bubbles: true, composed: true` なので shadow の外の `document` まで届く。`detail` は `{ root, key, index }`。
- 同じ `detail` を `window.__peithoShadowRoots` という配列に積む。

```js
const mount = ({ root }) => { /* root の中を探してマウントする */ }
for (const detail of window.__peithoShadowRoots ?? []) mount(detail)
document.addEventListener('peitho:shadow-mounted', (e) => mount(e.detail))
```

### 配列（バックログ）が要る理由

present は全スライドの host を 1 回の同期処理でまとめて接続する。一方 `<script type="module">` の読み込みは必ず非同期なので、モジュールが評価されてリスナーを登録する頃には最初の dispatch はすべて終わっている。イベントを購読するだけでは初回のマウントを全部取りこぼすので、配列を一度読み出して拾う。

配列の要素は `{ root, key, index }` で、shadow root そのものではない。v1.34.0 より前に使っていた fork 版は root を直接積んでいたので、要素を root として扱うコード（`for (const r of backlog) r.querySelectorAll(...)`）は v1.34.0 ではモジュールの評価中に例外を投げる。例外はリスナー登録より前に起きるので、何ひとつマウントされない。overview デッキの `mount.js` はこれで全コンポーネントが動かなくなっていた。

### ビューアごとの違い

| ビューア | 実行する場所 | `root` |
|---|---|---|
| present | スライド窓、発表者ビューの現在・次スライド、リモートのプレビュー | ShadowRoot |
| preview | ステージのみ（サムネイルでは実行しない） | ShadowRoot |
| build の配布ビューア | ページ送りのたびに差し込み直して実行 | light DOM なので `document` の `MutationObserver` でも見える |
| PDF 書き出し・lint | 1 つの文書に連結されたものがそのまま実行される | `.peitho-slide` の section 要素 |

PDF と lint でも同じイベントが発火するので、`{ root, key, index }` を前提に書いたスクリプトはどのビューアでも動く。

## ビューア以外で同じ仕組みを真似るとき

Peitho Studio は peitho-core を組み込んで独自のビューアを持っている。当初は独自の `peitho:canvas-mounted`（`detail` は `{ root }` だけ、配列なし）を使っていたが、v1.34.0 の仕組みに合わせた。合わせるときに気づいた点は次のとおり。

- `index` はスライドの HTML に含まれない。含まれるのは `data-slide-key` だけで、present は manifest の順序から host に `data-slide-index` を付けている。自前で出すなら manifest の key の並びから引く。
- 配列は同じ配列オブジェクトのまま更新する。読み込み時に参照を握ったスクリプトがあるため。Studio は編集のたびに同じ shadow root を再マウントするので、同じ root の要素は置き換え、切断済みの root は捨てて、配列が増え続けないようにした。
- classic script が実行時に `window.__peithoShadowRoots.forEach(...)` を読んでも落ちないよう、スクリプトを実行する前に配列を用意しておく。

## 理解度チェック

```quiz
`innerHTML` で差し込んだレイアウトの `<script>` が、エラーも出さずに実行されないのはなぜか?
---
HTML の仕様で、`innerHTML` でパースされた script には「実行済み」の印が付き、あとで接続しても実行されないから。`createElement` で作り直した要素に置き換えると実行される。
```

```quiz
`peitho:shadow-mounted` を購読するだけでは、present で最初のスライドのマウントを取りこぼすのはなぜか?
---
present は全 host を同期的にまとめて接続する一方、module script の評価は非同期なので、リスナーを登録する前に dispatch が終わっているから。`window.__peithoShadowRoots` を一度読み出して拾う。
```

```quiz
fork 版向けに書いた「バックログの要素 = shadow root」前提のマウント処理を v1.34.0 で動かすと、何が起きるか?
---
要素が `{ root, key, index }` なので `querySelectorAll` が関数でないという例外がモジュール評価中に出て、その後のリスナー登録まで届かず、何もマウントされない。
```

## 出典

- [mizzy/peitho#530](https://github.com/mizzy/peitho/issues/530) と v1.34.0 の `docs/plans/2026-09-23-layout-scripts.md`、`packages/peitho-present/src/scripts.ts`
- [piconic-ai/peitho-studio#73](https://github.com/piconic-ai/peitho-studio/pull/73) — Studio 側を同じ仕組みに合わせた変更
- [piconic-ai/barefootjs#3145](https://github.com/piconic-ai/barefootjs/pull/3145) — `site/core/slides/overview/component/mount.ts` の配列の読み出し

#peitho #shadow-dom #slides
