---
created: 2026-10-15
updated: 2026-10-15
title: Go のネイティブ fuzzing
description: go test に組み込まれたファジング。FuzzXxx の書き方、-fuzz を1つずつ回す制約、見つかった入力の扱い、CI の matrix での回し方、pedit で fuzz したもの。
tags: [go, fuzzing, testing]
---
# Go のネイティブ fuzzing

Go 1.18 から標準の `go test` に入っているファジング。`func FuzzXxx(f *testing.F)` を `_test.go` に書くと、
カバレッジを見ながら入力を変異させて、関数が panic したり `t.Fatal` を呼んだりする入力を探す。外部のファザーを
組み込む必要がない。

## 書き方

```go
func FuzzExternalEdit(f *testing.F) {
	f.Add("", "")                              // seed corpus
	f.Add("hello world\n", "hello, world!\n")
	f.Add("🌏 こんにちは\n", "🌏 こんばんは\n😀\n")
	f.Fuzz(func(t *testing.T, base, next string) {
		if !utf8.ValidString(base) || !utf8.ValidString(next) {
			return // pedit は UTF-8 のファイルしか共有しない
		}
		doc, text := textOf(base)
		ExternalEdit(doc, text, base, next, nil)
		if got := text.ToString(); got != next {
			t.Fatalf("ExternalEdit(%q -> %q) left %q", base, next, got)
		}
	})
}
```

- 1つの fuzz テストに fuzz target（`f.Fuzz` に渡す関数）は1つだけ。第1引数は `*testing.T`。
- fuzz する引数に使える型は `string`、`[]byte`、`int` / `uint` の各サイズ（`byte`・`rune` を含む）、
  `float32`、`float64`、`bool` だけ。構造体は渡せないので、`[]byte` を受けて中で組み立てる。
- `f.Add` の引数は fuzz target の引数と同じ型・同じ順序にする。

### 何を確かめるか

「panic しない」だけでも価値はあるが、性質（property）を書けるとずっと強い。pedit で書いたもの:

- **デコーダー**（メッセージ、暗号文、鍵、添付ファイルの参照、キャンバスの JSON）— 何を入れても panic せず、
  エラーを返すか正しく値を返す。
- **ファイルの外部編集を Yjs 文書に反映する関数** — 他の人の編集が同時に無ければ、反映後の文書は必ず新しい
  ファイルの内容と一致する（上の例）。
- **受信処理** — 部屋の他の参加者が送れるものは何でも、復号したあとの平文として受信処理に流し込む。
  参加者が CLI を落とせてはいけない。

最後のものは、暗号化の層の外から攻めても、ファザーはほぼ必ず復号の失敗で弾かれて先へ進めない。そこで同じ
パッケージの内部テストにし、`c.receive(c.cipher.Encrypt(plaintext))` と平文を自分で暗号化してから渡した。
入り口の検査の先に届かせる工夫は [[structure-aware-fuzzing]] と同じ考え方。

## 動かし方

```sh
go test ./internal/merge                                  # seed corpus だけを流す（普段の CI）
go test ./internal/merge -run '^FuzzExternalEdit$' \
  -fuzz '^FuzzExternalEdit$' -fuzztime 5m                 # 新しい入力を探す
```

- `-fuzz` なしの `go test` は、`f.Add` の seed と `testdata/fuzz/FuzzXxx/` のファイルを通常のテストとして流す
  だけ。普段の CI のコストは増えない。
- `-fuzz` には**1つの** fuzz テストに一致する正規表現を渡す。複数に一致すると、何も実行せずに失敗する
  （Go 1.27.2 で確認）。パッケージに fuzz テストが複数あるなら `^...$` で1つに絞る。`-run` も絞らないと、
  先に他のテストが全部走る。

  ```text
  testing: will not fuzz, -fuzz matches more than one fuzz test: [FuzzReceive FuzzDecodeMessage ...]
  ```
- `-fuzztime` を付けないと失敗するまで止まらない。
- 1回の実行は1秒でタイムアウトする。fuzz target は速く、決定的にする。
- カバレッジ計測が使えるのは AMD64 と ARM64。

### 見つかった入力の扱い

失敗した入力は `testdata/fuzz/FuzzXxx/` にファイルとして書き出される。これをコミットすると、以後の
`-fuzz` なしの `go test` で回帰テストとして毎回流れる。探索中に増えていく生成コーパスは `$GOCACHE/fuzz` に
置かれ、リポジトリには入らない。

## CI で回す

`-fuzz` は1回に1つしか指定できないので、GitHub Actions では fuzz テストごとに matrix のジョブを並べる。
pedit では週1回、各5分。失敗したらその入力をアーティファクトとして上げる。

```yaml
strategy:
  fail-fast: false
  matrix:
    target:
      - { pkg: ./internal/protocol, name: FuzzReceive }
      - { pkg: ./internal/merge, name: FuzzExternalEdit }
      # ...
steps:
  - name: Fuzz ${{ matrix.target.name }}
    env:
      PKG: ${{ matrix.target.pkg }}
      NAME: ${{ matrix.target.name }}
    run: go test "$PKG" -run "^${NAME}\$" -fuzz "^${NAME}\$" -fuzztime 5m
  - if: failure()
    uses: actions/upload-artifact@<sha>
    with:
      path: ${{ matrix.target.pkg }}/testdata/fuzz/${{ matrix.target.name }}/
```

`fail-fast: false` にしないと、1つの target が失敗した時点で他の target のジョブが止まる。

[[openssf-scorecard]] の Fuzzing チェックは、`FuzzXxx` 関数がリポジトリにあるかどうかで判定する。CI で
回しているかどうかは見ない。

## 理解度チェック

```quiz
パッケージに fuzz テストが複数あるとき、`go test -fuzz Fuzz` がエラーになるのはなぜか。
---
`-fuzz` は1つの fuzz テストにしか一致してはいけない。`^FuzzXxx$` のように1つに絞って、テストごとに実行する。
```

```quiz
暗号化されたメッセージを受け取る処理を、外側の入り口から fuzz してもほとんど意味がないのはなぜか。
---
ランダムな入力はほぼすべて復号（認証）に失敗して弾かれ、その先の受信処理に届かない。内部テストにして、平文を自分で暗号化してから渡す。
```

```quiz
fuzzing で見つかった失敗入力を、そのあとも毎回テストに使うにはどうするか。
---
`testdata/fuzz/FuzzXxx/` に書き出されたファイルをコミットする。`-fuzz` なしの `go test` が seed corpus として毎回流す。
```

## 出典

- [Go Fuzzing — The Go Programming Language](https://go.dev/doc/security/fuzz/)
  （[golang/website のソース](https://github.com/golang/website/blob/master/_content/doc/security/fuzz/index.md)）
- 実装: [piconic-ai/pedit#138](https://github.com/piconic-ai/pedit/pull/138)

関連: [[pedit-development-notes]]、[[gleam-compiler-fuzzing]]

#go #fuzzing #testing
