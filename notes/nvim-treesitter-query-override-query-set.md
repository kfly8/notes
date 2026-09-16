---
created: 2026-09-13
updated: 2026-09-13
title: nvim-treesitterのハイライトクエリを確実に上書きするには`vim.treesitter.query.set()`を使う
description: Neovimのtreesitterクエリ(queries/<lang>/<name>.scm)は'runtimepath'上の複数ファイルから解決される。
tags: [neovim, nvim-treesitter, treesitter, lua]
---
# nvim-treesitterのハイライトクエリを確実に上書きするには`vim.treesitter.query.set()`を使う

Neovimのtreesitterクエリ(`queries/<lang>/<name>.scm`)は`'runtimepath'`上の複数ファイルから解決される。同名のクエリが複数見つかった場合、後から見つかったファイルが**まるごと前の内容を置き換える**(`;; extends`で始まるファイルだけが追加でマージされる)。この仕組みを使い、`after/queries/<lang>/highlights.scm`にnvim-treesitterの既定クエリの一部を書き換えたコピーを置けば、プラグイン側の意図で上書きできる、というのが一般的に知られたやり方。

しかし実際にNeovimプラグインとして`after/queries/markdown_inline/highlights.scm`を配布し、その上書きに依存したところ、意図通りに勝たないケースがあった。`vim.treesitter.query.get_files('markdown_inline', 'highlights')`で確認すると、こちらの`after/queries`のファイルが結果に含まれず、nvim-treesitter本体のクエリだけが使われていた。

原因は、上書き側のクエリファイルが実際に`'runtimepath'`に乗るタイミングと、treesitterのハイライタがそのクエリを最初に要求してキャッシュするタイミングの**前後関係**に依存すること。上書き元のプラグイン自身をeagerロードにする(`ft = 'markdown'`のような遅延ロードをやめる)といった対策も試したが、それでも解決しなかった。

確実に効かせる方法は、ファイルベースの上書きに頼らず、`vim.treesitter.query.set(lang, query_name, query_text)`でLuaから明示的にクエリを注入すること。このAPIは「ライブクエリ編集」向けに用意されているもので、呼び出した時点でそのバッファ/言語の実効クエリを即座に差し替える。プラグインの初期化コード(モジュールのトップレベルなど、`require()`時に一度だけ実行される場所)で、自前の`.scm`ファイルの中身を読み込んで`query.set()`に渡せばよい。

```lua
local function install_query_override(lang)
  local path = plugin_root .. '/after/queries/' .. lang .. '/highlights.scm'
  local lines = vim.fn.readfile(path)
  vim.treesitter.query.set(lang, 'highlights', table.concat(lines, '\n'))
end
```

`after/queries/`にファイルを置くこと自体は(ドキュメント目的・将来のツールとの互換性のために)やめていないが、実際に効かせているのはこの`query.set()`呼び出しの方。

## 理解度チェック

```quiz
`after/queries/<lang>/highlights.scm`をプラグインに同梱するだけでは、なぜ既定クエリを確実に上書きできないことがあるのか?
---
'runtimepath'上でどちらのクエリファイルが後から見つかるかは、プラグイン同士のロード順(特に遅延ロードのタイミング)に依存するため。上書き側が先に見つかるとは限らない。
```

```quiz
`after/queries`ファイルに頼らず、Neovimのtreesitterクエリを確実に上書きする方法は?
---
`vim.treesitter.query.set(lang, query_name, query_text)`をLuaから直接呼び出す。呼び出した時点でそのクエリの実効内容が即座に差し替わる。
```

## 出典

- `conceal-comment.nvim`の実装中、`after/queries`による上書きが効かない現象に遭遇。`vim.treesitter.query.get_files()`で実際にロードされているファイルを確認し、`vim.treesitter.query.set()`への切り替えで解決したことを実機で確認した。関連: [[nvim-treesitter-markdown-conceal-defaults]]

#neovim #nvim-treesitter #treesitter #lua
