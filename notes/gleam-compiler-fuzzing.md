---
created: 2026-09-01
updated: 2026-09-01
title: Gleam コンパイラの structure-aware fuzzing
description: Fuzzing the Gleam Compiler（kurz.net、2026-08-25）が、Gleam コンパイラに structure-aware fuzzing を適用し、9件のバグを見つけた記録。
tags: [fuzzing, gleam, compiler, testing]
---
# Gleam コンパイラの structure-aware fuzzing

[Fuzzing the Gleam Compiler](https://www.kurz.net/posts/fuzzing-gleam-compiler)（kurz.net、2026-08-25）が、Gleam
コンパイラに [[structure-aware-fuzzing]] を適用し、9件のバグを見つけた記録。生成ベースの手法（後述の
smith）だけを使っている。

## Phase 1: パーサーのファジング

将来の Gleam バージョンとの互換性を保ちやすくするため、Gleam のコンパイラ API を直接使う方針を採った。
`cargo-fuzz` と libFuzzer でランダムバイト列を入力にする。

```sh
cargo +nightly fuzz run parse_only --fuzz-dir fuzzing-harness
```

この段階でも1秒間に24,887回の実行という速度が出て、ナイトリービルドの回帰（`const` 式の中で `|>`
パイプライン演算子を使うとパニックする）を見つけた。ランダムバイト列だけでも「壊れているのに誰も
気づいていない」箇所は見つかる、というのが Phase 1 の学び。

## Phase 2: 型安全なプログラム生成（smith）

パーサーを通るだけでは型検査やコード生成のバグには届かないため、Gleam の AST の簡易版を自作し、それを
確率的に埋めていく「smith」というジェネレーターを構築した。

> We create our own simplified version of the Gleam AST that we then generate programs for in a
> probabilistic manner

生成ロジックの核は、ある型（例えば `Int`）の式が必要になった時点で、その型を満たす複数の候補（リテラル
`3`、即時実行される無名関数 `fn() { 3 }()`、既存の変数への参照、など）から確率的に1つを選ぶという組み立て
方。これを再帰的に繰り返すことで、複数の定数・型定義、入れ子になった関数と `case` 式、リスト・タプル・
ビット配列などの複合データ型を含む、型安全なプログラムが生成される。

## echo 問題

Gleam の `echo` はデバッグ用に値をそのまま標準出力するデバッグプリント。生成したプログラムを Erlang
バックエンドと JavaScript バックエンドの両方で実行し、その出力を比較しようとすると、`echo` の表示形式が
バックエンドごとに違うため、単純な文字列比較では偽陽性（本当はバグではない差分）だらけになる。

具体的な差異:
- ビット配列: Erlang は `"\u{0001}\u{0002}\u{0003}"`、JavaScript は `<<1, 2, 3>>`
- 浮動小数点数: Erlang は `1.0`、JavaScript は `1`
- レコード: Erlang はフィールドラベルなしで表示、JavaScript はラベル付きで表示

対処として、生成した Module AST から `echo` される値の型を追跡し、Rust 側でその型に応じた「予測される
出力」を組み立てて、実際の出力と突き合わせる方式にした。片方のバックエンドの表示形式をもう片方の正解に
するのではなく、AST から独立に導いた期待値をオラクルにしている。[[pairwise-testing]] の「正解データが
書けないときは複数経路の食い違いを検出する」オラクル設計とは逆で、こちらは AST という第三の情報源から
期待値を機械的に導出できたケース。

## 重複検出と既知issueのフィルタリング

同じ根本原因から大量の類似ケースが見つかるとノイズになるため、エラーメッセージの文字列パターンで既知の
バグと突き合わせてフィルタリングする。

```rust
fn is_gleam_issue_6182(raw: &str) -> bool {
    raw.contains("SyntaxError: Unexpected token '&&'")
        || raw.contains("SyntaxError: Unexpected token ')'")
}

fn is_gleam_issue_6212(raw: &str) -> bool {
    raw.contains("TypeError:") && raw.contains("is not a function")
}
```

## ファザーの使い方

```sh
# 特定の生成プログラム（ID 948）だけ実行
cargo run -p fuzzing-cli -- run 948

# 900番から100件をバッチ実行
cargo run -p fuzzing-cli -- batch 900 100

# 生成されたプログラム（ID 947）のソースを表示
cargo run -p fuzzing-cli -- print 947
```

## 見つかったバグ

執筆時点の最新リリースは Gleam v1.18.1。作業は fork
（[daniellionel01/gleam:fuzzing](https://github.com/daniellionel01/gleam/tree/fuzzing)）上で行い、見つけた
9件のバグのうち8件を公式 GitHub issue として報告した。

| issue | 内容 |
|---|---|
| [#6179](https://github.com/gleam-lang/gleam/issues/6179) | 到達不能な分岐があると Erlang コード生成がパニックする |
| [#6180](https://github.com/gleam-lang/gleam/issues/6180) | 型名を `Record` にすると Erlang バックエンドが警告を出す |
| [#6181](https://github.com/gleam-lang/gleam/issues/6181) | JavaScript で `<<_:utf8>>` マッチングが誤った分岐を選ぶ |
| [#6182](https://github.com/gleam-lang/gleam/issues/6182) | `<<"":utf8>>` マッチングが不正な JavaScript を生成する |
| [#6187](https://github.com/gleam-lang/gleam/issues/6187) | 連続する `echo` と空文字列を含むリストで Erlang が例外を出す |
| [#6192](https://github.com/gleam-lang/gleam/issues/6192) | `const` 式の中で `\|>` を使うとコンパイラがクラッシュする |
| [#6212](https://github.com/gleam-lang/gleam/issues/6212) | JavaScript で関数呼び出しがローカル変数をシャドウしてしまう |
| [#6213](https://github.com/gleam-lang/gleam/issues/6213) | 外部変数をシャドウする `let` で JS コード生成が誤った変数を参照する |

残る1件は Gleam ではなく Erlang/OTP 本体の issue（#11494）として報告された。Gleam コンパイラのファジング
から Erlang ランタイム側のバグが見つかったことになる。

## 今後の展開として挙げられているもの

- GitHub Actions での継続的なファジング
- 言語サーバー（LSP）のファジング
- メタモルフィックテスティングの導入
- ジェネリクス・型推論に踏み込んだ複雑なテストケース生成
- Delta Debugging によるテストケースの最小化

## 理解度チェック

```quiz
Phase 1（ランダムバイト列でのパーサーファジング）だけでは、型検査やコード生成のバグに届きにくいのはなぜか。
---
ランダムなバイト列は大半が構文解析の時点でエラーとして弾かれてしまい、パーサーの先にある型検査やコード
生成のコードパスまで到達しないから。
```

```quiz
echo 問題で、Erlang と JavaScript 両バックエンドの実際の出力を直接比較する代わりに、何をオラクルにしたか。
---
生成した Module AST から echo される値の型を追跡し、Rust 側でその型に応じた「予測される出力」を組み立てて
比較した。バックエンドの表示形式の違い（ビット配列・浮動小数点・レコードなど）による偽陽性を避けるため。
```

```quiz
見つかった9件のバグのうち1件は、Gleam 自体ではなくどのプロジェクトに issue として報告されたか。
---
Erlang/OTP 本体（issue #11494）。Gleam コンパイラを対象にしたファジングから、生成先ランタイムのバグが
見つかった。
```

## 出典

- [Fuzzing the Gleam Compiler](https://www.kurz.net/posts/fuzzing-gleam-compiler) (kurz.net, 2026-08-25)

#fuzzing #gleam #compiler #testing
