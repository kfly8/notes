---
created: 2026-09-13
updated: 2026-10-07
title: Vim/Neovimは'foldminlines'が既定の1だと1行だけのfoldを閉じられない
description: "'foldmethod'=expr(またはmanual)で1行だけを対象にしたfoldを作っても、'foldminlines'が既定値の1のままだと、そのfoldを閉じた状態にすることができない。"
tags: [neovim, vim, fold]
---
# Vim/Neovimは'foldminlines'が既定の1だと1行だけのfoldを閉じられない

`'foldmethod'=expr`(または`manual`)で1行だけを対象にしたfoldを作っても、`'foldminlines'`が既定値の1のままだと、そのfoldを閉じた状態にすることができない。`foldlevel(lnum)`は正しくその行のfoldレベル(例えば1)を返すのに、`foldclosed(lnum)`は`-1`(開いている)を返し続ける。`set foldminlines=0`にすれば1行のfoldも閉じられる(Neovim v0.12.4で実測)。

複数行(2行以上)にまたがるfoldであれば、`zM`(全fold閉じる)や`:fold`で問題なく閉じる。

対して、行を隠すこと自体が目的なら[[nvim-treesitter-markdown-conceal-defaults]]で触れている`conceal`の方が、1行単位でも問題なく機能する。

## 原因は'foldminlines'

`:h 'foldminlines'`には次のようにある。

> Sets the number of screen lines above which a fold can be displayed closed. Also for manually closed folds. With the default value of one a fold can only be closed if it takes up two or more screen lines. Set to zero to be able to close folds of just one screen line.

`nvim --headless --clean -u NONE`で、4行のファイルに`foldmethod=manual`で`:2fold`した結果は次の通り。

```
foldminlines default=1
1line fold default: foldlevel(2)=1 foldclosed(2)=-1
2line fold default: foldclosed(3)=3
1line fold minlines=0: foldlevel(2)=1 foldclosed(2)=2
after zR foldclosed(2)=-1
after zM foldclosed(2)=2
```

- 既定値1では、1行のfoldは`foldclosed()`が`-1`、2行のfold(`:3,4fold`)は`3`(閉じている)。
- `foldminlines=0`にすると、同じ1行のfoldで`foldclosed(2)`が`2`になり、`zR`で`-1`、`zM`で`2`と開閉する。
- 確かめたのはheadlessでの`foldclosed()`の値のみ。0にしたときの画面描画はtmuxでは確かめていない。

## 当初の検証(foldminlinesが既定の1のとき)

当初は`'foldminlines'`の存在に気づかず、以下の方法を試して、いずれも単一行のfoldは閉じないと判断した。これらは`'foldminlines'`が既定の1のままでの結果であり、foldの作り方の問題ではなかった。

- `foldexpr`で該当行に数値レベル(例: `1`)を返す
- `foldexpr`で`>1`/`<1`という明示的な開始/終了記法を使う
- `foldmethod=manual`にして`:2fold`のような`:fold`コマンドで対象行を直接指定

一方、`foldexpr`で2行以上に`1`を返すようにすると、`zM`後に`foldclosed()`が正しく開始行番号を返し、画面上でも折りたたまれた(2行が1行の省略表示になった)ことを確認した。

検証はheadlessのnvimと、tmux上で実際にptyを割り当てた対話的なnvimセッションの両方で行った。headlessでの`foldclosed()`の値は実際の画面描画を反映しないことがある(要`redraw`や実UI)という可能性を疑い、tmuxでの再現でも同じ結果になることを確認したうえでの結論。

## 理解度チェック

```quiz
`foldlevel(lnum)`が1を返すのに`foldclosed(lnum)`が-1を返す典型的な原因は?
---
そのfoldが1行だけで、`'foldminlines'`が既定の1であること。1行のfoldは閉じて表示できない。`set foldminlines=0`にすれば閉じられる。
```

```quiz
1行だけのfoldが閉じないとき、`foldmethod=manual`で`:2fold`のように対象行を明示すれば回避できるか?
---
できない。`foldexpr`でも`:fold`による手動foldでも、`'foldminlines'`が1のままなら閉じない。回避するには`set foldminlines=0`にする。
```

## 出典

- Markdownの1行だけのHTMLコメントをfoldで隠す機能を`conceal-comment.nvim`に追加しようとして遭遇。headlessのnvimとtmux上の対話的なnvimの両方で`foldlevel()`/`foldclosed()`/実際の画面描画を突き合わせて確認した。

#neovim #vim #fold
