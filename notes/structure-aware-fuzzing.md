---
created: 2026-09-01
updated: 2026-09-01
title: structure-aware fuzzing
description: ランダムなバイト列をそのまま入力にする通常のファジングは、パーサーやデコーダーのように「まず構文・形式 チェックを通る」ことが前提の対象では大半が入り口で弾かれ、その先の意味解析やコード生成には届かない。
tags: [fuzzing, rust, wasm, testing]
---
# structure-aware fuzzing

ランダムなバイト列をそのまま入力にする通常のファジングは、パーサーやデコーダーのように「まず構文・形式
チェックを通る」ことが前提の対象では大半が入り口で弾かれ、その先の意味解析やコード生成には届かない。
structure-aware fuzzing（構造認識ファジング）は、入力の構造（言語なら AST、バイナリ形式なら命令列など）
を意識してファザーを組み、構文的に、できれば意味的にも妥当な入力を作ることで、入り口の先のバグに届かせる
手法。

生成（generation）と変異（mutation）の2系統に大別できる。

## 生成ベース: ゼロから構造を組み立てる

空の状態から構造を辿って入力を組み立てる。

- [[gleam-compiler-fuzzing]] の smith — Gleam の AST の簡易版を自作し、ある型（例えば `Int`）の式が
  必要になった時点で、その型を満たす複数の候補から確率的に1つを選ぶ、というのを再帰的に繰り返して
  型安全なプログラムを生成する。
- [Structure-Aware Fuzzing Experiment](https://fitzgen.com/2026/06/01/structure-aware-fuzzing-experiment.html)
  （fitzgen.com、2026-06-01、著者 Nick Fitzgerald）が Wasm 命令列の生成器として実装・比較した3手法:
  - **`arb`**: `arbitrary` クレートの `derive(Arbitrary)` で無制約に生成し、あとから `fixup()` で
    スタック抽象解釈を行い、不足するオペランドの補充や余剰値の `drop` による除去で有効な形に直す。
  - **`bottom_up`**: 空のスタックから、各時点でスタックの状態に対して有効な命令だけを候補にして前から
    積み上げていく（`wasm-smith` が採用する方式）。
  - **`top_down`**: 関数の戻り値の型から逆向きに、必要な型のスタックを保ちながら命令を構築し、最後に
    列を反転する（`rgfuzz` 論文の方式）。

fitzgen の実験では `top_down` が `bottom_up` より優れていた。理由として、Wasm の命令は一般にオペランド
数が結果の数より多く、前から積む `bottom_up` だと後続の命令選択でより多くの候補がスタックの型不一致で
フィルタリングされてしまう、と説明されている。

## 変異ベース: 既存の構造化データを構造ごと変異させる

生の入力バイト列を直接いじる代わりに、いったん構造化データにデコードし、その構造を保ったまま変異させて
から再エンコードする。fitzgen の実験では `mutate` 手法として実装:

- `derive(mutatis::Mutate)` で変異ロジックを自動生成する `mutatis` クレート（著者自身が開発）を使う。
- `serde` + `postcard` で入力バイト列を構造体へデコード → `mutatis::Session` で変異 → 再エンコード。
- 変異後も `fixup()` で有効性を保証する。

## 実験: 生成と変異、どちらが良いか

fitzgen の記事の核心は「1つだけ実装するなら生成と変異のどちらが優れているか」という問い。`arb` /
`bottom_up` / `top_down` / `mutate` の4ファザーを `libfuzzer-sys` 経由で Wasmtime に対して走らせ、
コードカバレッジを比較した（20試行 × 各ファザー、Mann-Whitney U 検定）。

- **5分間の短期実行**: `mutate` が他の3手法を36〜49%上回るカバレッジで大差をつけた。
- **24時間の長期実行**: 差は縮まったが、`mutate` が依然として1〜2%優位を保った。
- 著者は「今後は `arbitrary` ではなく `mutatis` を選ぶ」と方針を転換したと述べている。
- 実装の複雑さはどの手法でも同程度（スタックの型追跡がいずれにせよ必要になるため）としている。

## 道具立て（Rust エコシステム）

- `cargo-fuzz` / `libfuzzer-sys` — libFuzzer をベースにした Rust のファジングハーネスの標準ツールチェーン。
  [[gleam-compiler-fuzzing]] のパーサーファジング（Phase 1）でも使われている。
- `arbitrary` クレート — バイト列から任意の型を組み立てる、生成ベースファジングの標準クレート。
- `mutatis` クレート — 構造を保ったまま変異させるためのクレート。
- `wasm-smith` — Wasm モジュールを生成するクレート。`bottom_up` 方式を採用。

## 理解度チェック

```quiz
fitzgen の実験で、生成手法どうしを比べたとき bottom_up より top_down が優れていたのはなぜか。
---
Wasm 命令は一般にオペランド数が結果の数より多いため、前から積み上げる bottom_up では後続の命令選択で
候補がスタックの型不一致でより多くフィルタリングされてしまうから。戻り値側から逆向きに組む top_down は
この無駄が少ない。
```

```quiz
fitzgen の実験で、生成ベースと変異ベースの優劣は短期実行と長期実行でどう変わったか。
---
5分の短期実行では変異ベース（mutate）が36〜49%多いカバレッジで大差をつけたが、24時間の長期実行では
差が1〜2%まで縮まった。それでも一貫して変異ベースが優位だった。
```

```quiz
生成ベースの arb 手法で fixup() という後付けの修正パスが必要なのはなぜか。
---
derive(Arbitrary) で型やスタックの整合性を考えずに無制約に生成すると、スタックの型やオペランド数が
壊れた無効な入力になり得るため、生成後にスタック抽象解釈で不足オペランドの補充や余剰値の除去を行い、
有効な入力に直す必要があるから。
```

## 出典

- [Fuzzing the Gleam Compiler](https://www.kurz.net/posts/fuzzing-gleam-compiler) (kurz.net, 2026-08-25)
- [Structure-Aware Fuzzing Experiment](https://fitzgen.com/2026/06/01/structure-aware-fuzzing-experiment.html) (fitzgen.com, 2026-06-01)

#fuzzing #rust #wasm #testing
