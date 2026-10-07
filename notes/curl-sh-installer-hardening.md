---
created: 2026-10-07
updated: 2026-10-07
title: "`curl | sh` インストーラで踏んだ穴と対処"
description: curl -fsSL https://example/install.sh | sh で GitHub Releases からバイナリを入れるシェルスクリプトを書いて、 Pullfrog のレビューで指摘された穴と、その対処。
tags: [shell, security, インストーラ]
---
# `curl | sh` インストーラで踏んだ穴と対処

`curl -fsSL https://example/install.sh | sh` で GitHub Releases からバイナリを入れるシェルスクリプトを書いて、
[[pullfrog]] のレビューで指摘された穴と、その対処。pedit の install.sh（POSIX sh、macOS と Linux、
`~/.local/bin` に入れる、sudo もシェル設定の編集もしない）で確かめたもの。

## 途中で切れたダウンロードを実行しない

全処理を `main()` に入れ、最終行で `main "$@"` を呼ぶ。パイプで流し込まれたスクリプトは読みながら実行される
ので、関数定義の途中で切れても何も起きないが、トップレベルにコマンドを書いていると途中まで実行される。

## 最新タグの取得に API を使わない

`https://github.com/<owner>/<repo>/releases/latest` は `/releases/tag/<tag>` にリダイレクトする。
`curl -fsSLI -o /dev/null -w '%{url_effective}'` で最終 URL だけ取れば、API のレート制限に当たらない。

## 動いているバイナリに `cp` で上書きすると Linux では失敗する

実行中の実行ファイルに `cp` で書き込むと、Linux は `Text file busy`（ETXTBSY）で拒む。pedit を動かしたまま
インストーラを再実行する（セッション中に更新する）と失敗する。macOS では起きないので、macOS だけでテスト
していると気づかない。

対処は、配置先と同じディレクトリに一時ファイルを置いて `mv` で rename すること。rename は実行中のバイナリの
inode に書き込まないので成功し、書きかけのバイナリも残らない。同じファイルシステムに置くのは、`mv` が
rename になるようにするため。

## 一時ファイルの名前を推測できるようにしない

最初の修正は `.pedit.$$`（PID 入り）だった。PID は推測でき、そこに別ファイルへのシンボリックリンクを先に
置かれると、`cp` と `chmod 755` がリンク先に効く。レビューは `exec sh` で PID を保ったまま再現した
（exit 0）。他人が書き込めるディレクトリを配置先に指定したときに、自分が書けるファイルを壊される。

対処は `mktemp -d "$install_dir/.pedit.XXXXXXXX"` で**ディレクトリ**を排他的に作り、その中でコピーと `chmod`
をしてから `mv`。後始末も、自分が作れたディレクトリだけを消す。回帰テストは、被害ファイルへのリンクを先に
置き、内容と権限（600）が変わらないことを見る。

## 配置先がディレクトリだと `mv` は中に入れてしまう

`$install_dir/pedit` がディレクトリだと、`mv -f` はそれを置き換えず、中にファイルを移す。実行ファイルが
できないのに exit 0 で「Installed」と出る。`[ -d "$install_dir/pedit" ]` で先に失敗させる。`[ -d ]` は
シンボリックリンクをたどるので、ディレクトリへのリンクも拾える。

## 進捗の点滅はバックグラウンドジョブで、EXIT trap で止める

ダウンロードと来歴の検証（[[github-artifact-attestations]]）は数秒無言なので、`[ -t 1 ]` のときだけ `.` `..`
`...` を回す。回すのは `while` ループの `&`。スクリプト内（非対話シェル）のバックグラウンドジョブは SIGINT を
無視するので、Ctrl-C で親が死んでもジョブが残る。`trap cleanup EXIT` で kill し、
`trap 'fail interrupted' INT TERM` でその行を `... FAILED` で終える。

テストは `script` コマンドで疑似端末を作って走らせる。「点が回った」ことを示すには、最後の `... DONE` の
再描画にも含まれる文字列ではなく、アニメーションだけが出す1点・2点のフレームを探す。最初の assertion は
アニメーションを消しても通っていた（レビューで指摘）。

## 理解度チェック

```quiz
実行中の pedit に `cp` で新しいバイナリを上書きすると、Linux でどうなるか。
---
`Text file busy` で失敗する。同じディレクトリに置いた一時ファイルを `mv` で rename すれば置き換えられる。macOS では失敗しないので気づきにくい。
```

```quiz
一時ファイルを `.pedit.$$` のような名前で置くと何が起きうるか。
---
PID は推測できるので、先にシンボリックリンクを置かれると `cp` と `chmod` がリンク先に効く。`mktemp -d` で排他的に作ったディレクトリの中に置く。
```

```quiz
`trap cleanup EXIT` でバックグラウンドの点滅ジョブを kill するのはなぜ必要か。
---
スクリプト内のバックグラウンドジョブは SIGINT を無視するので、Ctrl-C で親が終わってもジョブだけ残る。
```

## 出典

- [piconic-ai/pedit#89](https://github.com/piconic-ai/pedit/pull/89)（Text file busy、シンボリックリンク、ディレクトリ）、[#90](https://github.com/piconic-ai/pedit/pull/90)（点滅）
- pedit の [install.sh](https://github.com/piconic-ai/pedit/blob/main/packages/web/public/install.sh)

関連: [[pedit-development-notes]]

#shell #security #インストーラ
