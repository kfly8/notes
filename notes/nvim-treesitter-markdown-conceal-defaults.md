---
created: 2026-09-13
updated: 2026-09-13
title: nvim-treesitterのmarkdown/markdown_inlineクエリは`conceallevel`で色々隠している
description: Neovimのconceal(extmarkのconcealフィールドや:syn-conceal)は、ウィンドウローカルな'conceallevel'という単一のオプションでON/OFFが決まる。
tags: [neovim, nvim-treesitter, conceal, markdown]
---
# nvim-treesitterのmarkdown/markdown_inlineクエリは`conceallevel`で色々隠している

Neovimの`conceal`(extmarkの`conceal`フィールドや`:syn-conceal`)は、ウィンドウローカルな`'conceallevel'`という単一のオプションでON/OFFが決まる。機能ごとの個別スイッチは存在しない。

nvim-treesitterが同梱する`queries/markdown_inline/highlights.scm`と`queries/markdown/highlights.scm`は、この`'conceallevel'`を使って、デフォルトで以下を隠している。

- `markdown_inline/highlights.scm`
  - `emphasis_delimiter`・`code_span_delimiter`(`**`/`*`/コードスパンのバッククォート): `(#set! conceal "")`で完全に消える
  - インラインリンク`[text](url)`の`[`/`]`/`(`/リンク先URL/`)`: concealされ、`text`だけが残る
  - 画像記法`![alt](url)`や各種reference linkも同様にconceal
  - `&nbsp;`などのHTMLエンティティ: `(#set! conceal " ")`のように、対応する1文字に置換される
- `markdown/highlights.scm`
  - フェンスコードブロックの区切り(` ``` `)と言語アノテーション: `conceal`に加えて`conceal_lines`も設定されており、**行そのものが丸ごと非表示**になる(単なる文字concealと違い、行の高さごと消える)

つまり、何らかの独自機能(例: HTMLコメントを隠す)のために`'conceallevel'`をトグルするプラグインを書くと、これらすべてが巻き添えで一緒に表示/非表示が切り替わる。`**bold**`が突然`bold`になったり、フェンスコードブロックの```` ``` ````行ごと消えたり、`[text](url)`が`text`だけになったりする。

対処法(既定クエリからconcealだけを取り除いて上書きする)は[[nvim-treesitter-query-override-query-set]]。

## 検証方法の注意

headlessなnvimで`nvim_buf_get_extmarks()`や`:h synconcealed()`を使って確認しようとすると、実際にはconcealされているのに「何も見つからない」という偽陰性が出ることがある(treesitterのハイライトは内部的に別経路で描画されており、これらのAPIで単純に拾えるとは限らない)。`vim.fn.screenstring(row, col)`で実際の画面グリッドを読むのが最も確実。

## 理解度チェック

```quiz
Neovimでconcealを部分的に(例えば「太字の記号だけ残して、別の要素だけ隠す」ように)コントロールできない理由は?
---
concealは`'conceallevel'`という単一のウィンドウローカルオプションでON/OFFが決まるため。機能ごとの個別スイッチはなく、'conceallevel'を上げるとそのウィンドウの全conceal定義が同時に有効になる。
```

```quiz
nvim-treesitterの`markdown/highlights.scm`でフェンスコードブロックの区切り行が「文字だけ」ではなく「行ごと」消えるのはなぜ?
---
`(#set! conceal "")`だけでなく`(#set! conceal_lines "")`も設定されているため。conceal_linesは該当ノードを含む行そのものを描画対象から外す。
```

## 出典

- `conceal-comment.nvim`(HTMLコメントをconcealするNeovimプラグイン)の実装中に遭遇。`~/.local/share/nvim/lazy/nvim-treesitter/queries/markdown_inline/highlights.scm`と`queries/markdown/highlights.scm`(2026年9月時点のnvim-treesitter)を直接読み、`vim.fn.screenstring()`での実機検証で裏取りした。

#neovim #nvim-treesitter #conceal #markdown
