---
created: 2026-10-18
updated: 2026-10-18
title: pedit の書き戻しを動かして確かめた記録
description: pedit の書き戻しで、途中の姿が見えないか、重なった保存が戻るか、どこで失われるかを Linux で動かして確かめた記録。
tags: [pedit, go, filesystem, linux]
---
# pedit の書き戻しを動かして確かめた記録

[[pedit-write-back]] と [[atomic-replace-rename-exchange]] に書いたことを、実際に動かして確かめた記録。
置き換え保存で途中の姿が見えないか、重なった保存が戻るか、どこで失われるか。

## 環境

- Linux 6.18、ext4。root で動かした。権限まわりは capability を外すか uid 1000 に切り替えた。
- 保存の仕組みの実験は pedit の main 9fbc1e4（PR #119 をマージした後。v0.1.2 でリリース）と Go 1.25.0。
  保存の部品（`internal/filewriter`）は v0.1.7 まで書き方が変わっていない。
- システムコールは `strace -f -e trace=%file,unlink,unlinkat,rename,renameat,renameat2,fchmod` で取った。
  `fchmod` は `%file` に含まれないので足してある。
- macOS と Windows では動かしていない。

## その場で書き換えと、一時ファイル + rename

書き手が 4 MiB の `A…A` と `B…B` を交互に書き続け、読み手が 3 秒読み続けて、読めた中身を数えた。

```go
// -mode=rename: 同じディレクトリの一時ファイルに全部書いてから rename(2) で置き換える
// -mode=inplace: os.WriteFile で直接書き換える（O_TRUNC で空にしてから write）
func writeLoop(mode, dir, target string, a, b []byte, stop *atomic.Bool) {
	for i := 0; !stop.Load(); i++ {
		content := a
		if i%2 == 1 {
			content = b
		}
		switch mode {
		case "rename":
			tmp, _ := os.CreateTemp(dir, ".doc-*.tmp")
			tmp.Write(content)
			tmp.Close()
			os.Rename(tmp.Name(), target)
		case "inplace":
			os.WriteFile(target, content, 0o644)
		}
	}
}

// 読み手: 空、全部 A、全部 B、それ以外（書きかけ）を数える
for time.Now().Before(deadline) {
	got, _ := os.ReadFile(target)
	switch {
	case len(got) == 0:
		counts["empty"]++
	case len(got) == size && bytes.Count(got, []byte("A")) == size,
		len(got) == size && bytes.Count(got, []byte("B")) == size:
		counts["full"]++
	default:
		counts["partial"]++
	}
}
```

| 書き方 | 読んだ回数 | 空 | 書きかけ |
| --- | --- | --- | --- |
| その場で書き換え（1 回目） | 209,499 | 207,772 | 1,721 |
| その場で書き換え（2 回目） | 195,840 | 194,165 | 1,671 |
| その場で書き換え（3 回目） | 204,934 | 203,186 | 1,744 |
| 一時ファイル + rename（1 回目） | 1,887 | 0 | 0 |
| 一時ファイル + rename（2 回目） | 1,745 | 0 | 0 |
| 一時ファイル + rename（3 回目） | 1,738 | 0 | 0 |

空のファイルは一瞬で読めるので、その場書き換えは読んだ回数そのものが膨らむ。見るのは途中の姿が 0 回かどうか。
pedit の `BoundFile.Write` を書き手にした版も、空・書きかけともに 0 回だった。

## 入れ替えと作成だけの挙動

- `a`（中身 `new`、inode 1639063）と `b`（中身 `old`、inode 1639064）を `RENAME_EXCHANGE` で入れ替えると、`a` が
  1639064 の `old`、`b` が 1639063 の `new` を指し、どちらの名前も残った。
- `/dev/shm` のファイルと作業ディレクトリのファイルを入れ替えると `EXDEV`。rename でも同じ。
- 相手の名前が無いと `RENAME_EXCHANGE` は `ENOENT`。
- `RENAME_NOREPLACE` は、行き先があると `file exists` で何も変わらず、無ければ普通の rename と同じく移った。
- `O_CREAT|O_EXCL` は、普通のファイル・ディレクトリ・行き先の無いシンボリックリンクのどれがある名前でも `EEXIST`。
  `O_EXCL` を外して同じ「仕込まれたリンク」を開くと、リンクがたどられて別のディレクトリに `victim` ができ、
  `pwned` が書かれた。
- `os.Root` は、外のファイルへのハードリンクを中に置くと、そのまま読めた。

## 置き換えで変わるもの

`BoundFile.Write` を 1 回呼んだ前後（入れ替えの経路）。

| 性質 | 前 | 後 |
| --- | --- | --- |
| inode | 1639373 | 1639374 |
| ハードリンク `keep` | 同じ本体 | 古い中身のまま |
| 拡張属性 `user.note` | あり | なし（`keep` 側に残る） |
| 所有者 | 1000:1000 | 0:0 |
| パーミッション | 0640 | 0640 |

setuid などの特殊ビットは落ちた（`2754` が `754`）。新しく作るファイルは、umask `022` と `077` で `0600`、`0277` で
`0400` になり、次の保存でもそれを引き継いだ。`0444` のファイルも置き換えられて `0444` のまま残った（ただし
pedit は共有を始める前に書き込めないファイルを断る）。

## 重なった保存を戻す

実験用のテストで、比べてから入れ替えるまでの間に rename で保存を差し込んだ。`strace` の要所だけ。

```text
renameat2(8, ".pedit-88e0…4eba.tmp", 8, "shared.md", RENAME_EXCHANGE) = 0
read(8, "editor", 32768) = 6    ← v0 でない。保存が重なった
renameat2(8, ".pedit-88e0…4eba.tmp", 8, "shared.md", RENAME_EXCHANGE) = 0
read(8, "v2", 32768) = 2        ← 戻ってきたのは pedit の本体
（約 5 ms 待つ）
read(8, "v2", 32768) = 2        ← 5 ms 後も同じ
unlinkat(7, ".pedit-88e0…4eba.tmp", 0) = 0
read(8, "editor", 32768) = 6    ← Flush の読み直し。v2 は置かれていない
```

共有ファイルの名前には、エディタが保存した本体（同じ inode）と中身 `editor` が戻った。`lastWritten` は `v0` の
まま、`Flush` は `ErrExternalChange` を返した。

## 遅れて書くエディタ、シェルの `>`

- 入れ替えの直前にエディタ役がファイルを開き、開いてから 1 ms 後に書くと、5 回とも元に戻されて残った。8 ms 後に
  書くと、5 回とも失われた。5 ms の読み直しより遅いので見分けられない。
- 空の共有ファイルに、シェルの `>` 役が入れ替えの直前に開き、pedit の書き込みの後に書くと、5 回とも失われた。
  中身のあるファイルでは、切り詰めた時点で中身が変わるので 5 回とも戻された。

## ストレステスト

pedit のリポジトリにあるストレステストで、別のプロセスのエディタに保存を重ねさせた。別のプロセスにするのは、
エディタの open・切り詰め・rename が pedit の goroutine を待たないようにするため。エディタは一時ファイルが
ディレクトリに現れた時点で動き出すので、保存が入れ替えの前後に集まる。1 MiB、保存の仕方 3 通り（rename で保存、
その場で書き換え、開いてから少し遅れて書く。既定の遅れは 3 ms）を 300 回ずつ。

```sh
PEDIT_STRESS=1 go test -race -run TestStress -v ./internal/filewriter/
PEDIT_STRESS=1 PEDIT_STRESS_FALLBACK=1 go test -run TestStress -v ./internal/filewriter/   # 代わりの方法を強制
```

| 条件 | 結果 |
| --- | --- |
| 入れ替え、2 回 | 失われた保存は 0 回 |
| 入れ替え、遅れを最大 8 ms のランダムに | 300 回中 10 回が黙って失われた |
| 代わりの方法、`-race` なし 12 回 | rename で保存するエディタが、4 回の実行で 1 回ずつ黙って失われた |
| 代わりの方法、失われて報告されたもの | 1 回の実行あたり rename 0 回、その場書き換え 0〜5 回、遅れて書く 13〜24 回 |
| 代わりの方法、`-race` あり 2 回 | 遅れて書くエディタで 105 回と 109 回が報告された |
| 代わりの方法、遅れを最大 8 ms に 2 回 | 300 回中 9 回と 8 回が黙って失われた |

## 強制終了

一時ファイルを書き終えた後の 4 か所で `os.Exit(130)` を呼んだ。どこで止めても、一方の名前に元の中身、もう一方
（`.pedit-…tmp`）に新しい中身が、どちらも丸ごと残った。

## ファイルとディレクトリの監視

fsnotify でファイル自体を見ると、rename で保存するエディタの 1 回目の保存で `CHMOD` と `REMOVE` が届き、2 回目は
何も届かなかった。ディレクトリを見ると、2 回とも `notes.md: CREATE` が届いた。pedit 自身の入れ替えでも
`CREATE` と `RENAME` が届くので、取り込み側は `lastWritten` との比較でこだまを止めている（[[pedit-file-sync]]）。

## 躓いた点

- root は `chmod 0555` のディレクトリにも書けるので、保存を失敗させる実験が成り立たない。capability を外すか、
  uid 1000 に切り替えた。同じ理由で、`TestStopReportsFailedFinalWrite` は root で動かすと失敗する。
- `strace` には Go のランタイムの行（`epoll_ctl`、`futex`、`fcntl`、スレッドごとの `getrandom`）が大量に混ざる。
  5 ms の待ちも `nanosleep` ではなく、`futex` で眠ったスレッドとランタイムの `epoll_pwait`（4 ms と 1 ms）として出る。
- 遅れて書くエディタの再現は、`-race` の有無で件数が大きく変わる。比べるなら条件を揃える。

## コードから読み取れること

- 入れ替えで消せなくなったのは「確かめてから置き換えるまでの隙」で、「置き換えた後に遅れて届く書き込み」は
  5 ms の読み直しで一部を拾っているだけ。8 ms の遅れで再現したとおり、待ち時間の選び方の問題として残る。
- 代わりの方法では、黙って失われるものを減らせない。報告できるのは、置き換えた古い本体に 5 ms 以内に書かれた
  ものだけ。

## 理解度チェック

```quiz
その場書き換えの実験で、読んだ回数そのものが rename の 100 倍近くになったのはなぜか。
---
その場書き換えでは空のファイルが見える時間が長く、空のファイルは一瞬で読めるので、読み手のループが速く回ったから。比べるべきは途中の姿の回数。
```

```quiz
遅れて書くエディタの実験で、1 ms 後の書き込みは戻されたのに 8 ms 後の書き込みは失われたのはなぜか。
---
pedit は外に出したファイルを 5 ms 待って読み直してから消すので、それより後に届いた書き込みはファイルと一緒に消えるから。
```

## 出典

- [piconic-ai/pedit](https://github.com/piconic-ai/pedit) 9fbc1e4 と v0.1.7 の `internal/filewriter`（`stress_test.go` を含む）、`internal/session`
- [rename(2)](https://man7.org/linux/man-pages/man2/rename.2.html)、[fsnotify](https://github.com/fsnotify/fsnotify)

#pedit #go #filesystem #linux
