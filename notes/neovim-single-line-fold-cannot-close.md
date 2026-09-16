---
created: 2026-09-13
updated: 2026-09-13
title: Vim/Neovimは1行だけのfoldを閉じた状態にできない
description: "'foldmethod'=expr(またはmanual)で1行だけを対象にしたfoldを作っても、そのfoldを閉じた状態にすることができない。"
tags: [neovim, vim, fold]
---
# Vim/Neovimは1行だけのfoldを閉じた状態にできない

`'foldmethod'=expr`(または`manual`)で1行だけを対象にしたfoldを作っても、そのfoldを閉じた状態にすることができない。`foldlevel(lnum)`は正しくその行のfoldレベル(例えば1)を返すのに、`foldclosed(lnum)`は常に`-1`(開いている)を返し続ける。

複数行(2行以上)にまたがるfoldであれば、`zM`(全fold閉じる)や`:fold`で問題なく閉じる。

対して、行を隠すこと自体が目的なら[[nvim-treesitter-markdown-conceal-defaults]]で触れている`conceal`の方が、1行単位でも問題なく機能する。

## 検証

以下の方法をすべて試したが、いずれも単一行のfoldは閉じなかった。

- `foldexpr`で該当行に数値レベル(例: `1`)を返す
- `foldexpr`で`>1`/`<1`という明示的な開始/終了記法を使う
- `foldmethod=manual`にして`:2fold`のような`:fold`コマンドで対象行を直接指定

一方、`foldexpr`で2行以上に`1`を返すようにすると、`zM`後に`foldclosed()`が正しく開始行番号を返し、画面上でも折りたたまれた(2行が1行の省略表示になった)ことを確認した。

検証はheadlessのnvimと、tmux上で実際にptyを割り当てた対話的なnvimセッションの両方で行った。headlessでの`foldclosed()`の値は実際の画面描画を反映しないことがある(要`redraw`や実UI)という可能性を疑い、tmuxでの再現でも同じ結果になることを確認したうえでの結論。

## 理解度チェック

```quiz
`foldlevel(lnum)`が1を返すのに`foldclosed(lnum)`が常に-1を返す典型的な原因は?
---
そのfoldが1行だけで構成されている場合。Vim/Neovimは単一行のfoldを閉じた状態にできない。2行以上にまたがるfoldなら正常に閉じる。
```

```quiz
1行だけのfoldが閉じないことを、`foldmethod=manual`で`:2fold`のように明示的に対象行を指定しても回避できるか?
---
できない。`foldexpr`(数値・`>1`記法どちらも)でも`:fold`コマンドによる手動foldでも、単一行のfoldは同じく閉じない。
```

## 出典

- Markdownの1行だけのHTMLコメントをfoldで隠す機能を`conceal-comment.nvim`に追加しようとして遭遇。headlessのnvimとtmux上の対話的なnvimの両方で`foldlevel()`/`foldclosed()`/実際の画面描画を突き合わせて確認した。

#neovim #vim #fold
