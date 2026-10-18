---
created: 2026-10-18
updated: 2026-10-18
title: rename と RENAME_EXCHANGE による置き換え保存
description: 一時ファイルに書いて rename で置き換える保存と、置き換えられた側を名前付きで残して確かめられる Linux の RENAME_EXCHANGE。
tags: [linux, filesystem, go, pedit]
---
# rename と RENAME_EXCHANGE による置き換え保存

ファイルを書き換えるときに、その場で上書きせず、同じディレクトリの一時ファイルに書いてから名前を付け替える
保存の仕方。読む側には古い中身の全体か新しい中身の全体しか見えない。Linux の `renameat2(2)` に
`RENAME_EXCHANGE` を渡すと、付け替えで置き換えられた側の本体を名前付きで残せるので、置き換えた直後に
「自分が消そうとしているものが本当に古い中身か」を確かめられる。[[pedit-write-back]] がこれを使っている。

## その場で書き換えると途中の姿が見える

`os.WriteFile` のような普通の書き込みは、`O_TRUNC` でファイルを長さ 0 にしてから中身を書く。その間に読んだ
プログラムには、空のファイルや書きかけのファイルが見える。4 MiB の中身を書き換え続けながら 3 秒読み続けると、
約 20 万回空のファイルが読めた。一時ファイルに書いて rename する方式では 0 回だった
（[[pedit-write-back-experiment]]）。

## rename は名前の付け替え

ディレクトリは「名前 → 本体（inode）」の表で、`rename(2)` はこの表の行を書き換えるだけ。中身はコピーしない。
`rename(tmp, notes.md)` の後、`notes.md` は一時ファイルの本体を指し、一時ファイルの名前は消える。付け替えの途中
という状態は外から見えない。

- **同じマウントの中でしか使えない。** `/dev/shm` から作業ディレクトリへ rename すると `EXDEV`（Invalid
  cross-device link）で失敗する。bind mount をまたいでも同じ。だから一時ファイルは `/tmp` ではなく、置き換える
  ファイルと同じディレクトリに作る。
- **要るのはディレクトリへの書き込み権。** ファイル自体が `0444` でも置き換えられる（そして `0444` のまま残る）。
  逆にディレクトリに書けないと、一時ファイルを作れずに失敗し、元のファイルは無傷のまま。
- **一時ファイルは `O_CREAT|O_EXCL` で作る。** その名前に何かあれば（行き先の無いシンボリックリンクでも）
  `EEXIST` で失敗するので、先回りして置かれたリンクを通して書かされない。乱数の名前は衝突で作成が失敗するのを
  避けるためで、安全性は `O_EXCL` が担う。

## 置き換えで変わるもの

名前は同じでも、中身は新しい本体になる。

| 性質 | 置き換えた後 |
| --- | --- |
| inode | 新しい番号 |
| ハードリンク | もう一方の名前は古い本体を指したまま |
| 拡張属性・ACL | 古い本体に残り、新しい本体には無い |
| 所有者 | 書いたプロセスのもの |
| パーミッション | 引き継ぐなら自分で `fchmod` する |

`fchmod` で写すのは rwx の 9 ビットにとどめるのが普通で、setuid などは落ちる（`2754` が `754` になった）。
`fchmod` には umask がかからないので、新しく作るファイルに使うと umask を無視することになる。新しいファイルは
作るときに渡す値（たとえば `0600`）から umask を落とした値に任せる。

## rename は置き換えた側を黙って消す

置き換える前に「ディスクの中身が、自分が前に書いたものと同じか」を確かめても、確かめてから rename するまでの間
に別のプロセス（エディタの保存など）が同じ名前に書けば、その本体は rename で名前を失う。誰も気づかないまま
消える。確かめるのと置き換えるのを一度にはできないので、確かめる処理をいくら足しても隙は残る。

## RENAME_EXCHANGE: 置き換えた側を名前付きで残す

`renameat2(2)`（Linux 3.15 から）に `RENAME_EXCHANGE` を渡すと、2 つの名前をどちらも残したまま、それぞれが
指す本体を一度に取り替える。rename と同じく途中の状態は見えず、同じマウントの中だけで使える。macOS では
`renameatx_np` の `RENAME_SWAP` が同じ働きをする。

置き換えに使うと、元の本体は消えずに一時ファイルの名前へ移る。そこで、置き換えた後に移った側を読めば、
確かめてから置き換えるまでの間に誰かが書いたかどうかが分かる。

```canvas
{
  "nodes": [
    {"id": "write", "type": "text", "x": 140, "y": 0, "width": 300, "height": 56, "text": "一時ファイル .tmp に\n新しい中身を書く"},
    {"id": "swap", "type": "text", "x": 140, "y": 116, "width": 300, "height": 72, "text": "RENAME_EXCHANGE(.tmp, notes.md)\nnotes.md → 新しい本体\n.tmp → 元の本体"},
    {"id": "check", "type": "text", "x": 140, "y": 248, "width": 300, "height": 56, "text": ".tmp に移った元の本体を読む"},
    {"id": "ok", "type": "text", "x": 0, "y": 384, "width": 260, "height": 72, "text": "前に書いた中身のまま\n→ .tmp を消す"},
    {"id": "back", "type": "text", "x": 320, "y": 384, "width": 260, "height": 72, "text": "違う中身（誰かの保存）\n→ もう一度入れ替えて\nnotes.md に戻す", "color": "4"}
  ],
  "edges": [
    {"id": "e1", "fromNode": "write", "toNode": "swap"},
    {"id": "e2", "fromNode": "swap", "toNode": "check"},
    {"id": "e3", "fromNode": "check", "toNode": "ok", "fromSide": "bottom", "toSide": "top", "label": "同じ"},
    {"id": "e4", "fromNode": "check", "toNode": "back", "fromSide": "bottom", "toSide": "top", "label": "違う"}
  ]
}
```

強調した箱が rename ではできないこと。rename なら、違う中身の本体はこの時点でもう名前を失っている。

それでも隙はゼロにならない。元の本体を開いていたプロセスが、読み終えた後に書けば見分けられない。pedit は
5 ms 待って読み直すことで、少し遅れて書くエディタまでは拾っている（[[pedit-write-back]]）。

## RENAME_NOREPLACE: 名前が空いているときだけ置く

`renameat2` のもう 1 つのフラグ。行き先の名前に何も無いときだけ rename し、何かあれば `EEXIST` で失敗する。
`O_EXCL` の、名前の付け替え版。macOS では `RENAME_EXCL`。`RENAME_EXCHANGE` は相手の名前が無いと `ENOENT` で
失敗するので、まだ無いファイルを作るときはこちらを使う。使えない場所ではハードリンク（`link(2)` も名前があれば
失敗する）で代わりにできる。

## 使えない場所

- 対応していないファイルシステムでは `EINVAL` などで失敗する。カーネルが古ければ `ENOSYS`。pedit は
  `ENOSYS`・`EINVAL`・`EOPNOTSUPP` を「使えない」と読み、確かめてから rename する方法に切り替える。pedit の
  ドキュメントは、入れ替えが使えない場所として Windows、NFS・SMB・FUSE、exFAT、macOS の FAT を挙げている。
- Go の `os.Root` の `Rename`（Go 1.25 から）はフラグの無い `renameat` で、入れ替えも作成だけも持たない。
  `os.Root` が握るディレクトリを `"."` で開き直し、その fd を起点に、ディレクトリの中の名前だけを渡して
  `unix.Renameat2` を呼べば、`os.Root` の外には出ない。

## 読む側への原子性と、電源断への耐性は別

rename も入れ替えも、他のプログラムから書きかけが見えないことは保証するが、電源が落ちた後にどちらの中身が
残るかは保証しない。それには一時ファイルと親ディレクトリの `fsync` が要る。ext4 の既定の `auto_da_alloc` は、
rename で既存のファイルを置き換える書き方を見つけて空のファイルになるのを避けるが、Linux 6.18 の
`fs/ext4/namei.c` を読む限り、この働きは rename のときだけで `RENAME_EXCHANGE` には働かない（電源を落として
確かめてはいない）。

## 理解度チェック

```quiz
置き換え保存の一時ファイルを `/tmp` ではなく、置き換えるファイルと同じディレクトリに作るのはなぜか。
---
rename も入れ替えも同じマウントの中でしか使えず、`/tmp` が別のファイルシステムだと `EXDEV` で失敗するから。
```

```quiz
置き換える直前に「ディスクの中身が前に書いたものと同じか」を確かめていても、rename だと他の保存を消しうるのはなぜか。
---
確かめてから rename するまでの間に書かれた本体は、rename で名前を失って誰にも気づかれずに消えるから。確かめると置き換えるを一度にはできない。
```

```quiz
`RENAME_EXCHANGE` で置き換えると、rename では分からなかった何が分かるようになるか。
---
置き換えられた元の本体が一時ファイルの名前に残るので、それを読めば、確かめてから置き換えるまでの間に誰かが書いたかどうかが分かり、書いていれば入れ替え直して戻せる。
```

## 出典

- [rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html)（`renameat2`、`RENAME_EXCHANGE`、`RENAME_NOREPLACE`）
- [Go の `os.Root`](https://pkg.go.dev/os#Root)
- [piconic-ai/pedit](https://github.com/piconic-ai/pedit) v0.1.7 の `internal/filewriter/bound.go`、`exchange_linux.go`、`exchange_darwin.go`、`docs/local-files.md`
- Linux 6.18 の `fs/ext4/namei.c`（`auto_da_alloc` の扱い）

#linux #filesystem #go #pedit
