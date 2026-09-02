---
created: 2026-09-02
updated: 2026-09-02
title: BarefootJS の golden vector コーパス
description: BarefootJS のリファレンス実装との差分テスト がコンパイル済みテンプレート出力を Hono とライブに突き合わせるのに対し、 golden vector コーパスはその手前——各言語のネイティブランタイム（テンプレートが実際に実行時に呼ぶ ヘルパー関数・式評価器）が、JS の挙動と値として一致するかを検証する。
tags: [barefootjs, testing]
---
# BarefootJS の golden vector コーパス

[[barefootjs-reference-diff-testing]] がコンパイル済み**テンプレート出力**を Hono とライブに突き合わせるのに対し、
golden vector コーパスはその手前——各言語の**ネイティブランタイム**（テンプレートが実際に実行時に呼ぶ
ヘルパー関数・式評価器）が、JS の挙動と値として一致するかを検証する。`packages/adapter-tests/vectors/`。

## 2つのコーパス

- **`vectors.json`**（395ケース）: テンプレートヘルパー関数のカタログ（算術・文字列・型強制・`sort`/
  `reduce`等が受け付ける高階プロジェクション関数）。**value-compat**（型は違っても値として等価なら合格
  ——整数と浮動小数点数を数値として比較、真偽値は truthy/falsy で比較）。
- **`eval-vectors.json`**（102ケース）: `reduce`/`sort`/`map`/`filter`/`find` の高階コールバック本体を
  評価する `ParsedExpr` 評価器用。こちらは**厳格**——真偽値は本物の boolean を返す必要があり、数値と
  文字列の区別も保たれなければならない。**divergence 宣言は一切許可されない**。

両ファイルとも「生成されコミットされる、手で編集しない」artifact。`cases.ts` のケース定義＋JS 式
そのもの（再実装ではない）を `reference` として、`generate.ts` が期待値を計算して JSON に書き出す。
freshness テストがコミット済みファイルとケース定義のドリフトを CI で検出する——
[[barefootjs-adversarial-catalog]] の `generated-data-points.json` と同じ「宣言でなく計算」の設計。

## `vector-divergences.json`: 各バックエンドが自分の逸脱を宣言する

`vectors.json` の合格基準は value-compat だが、それでもホスト言語ゆえに JS と一致させられない、あるいは
意図的に一致させない値がある。各バックエンドパッケージ自身が `vector-divergences.json`
（例: `packages/adapter-go-template/runtime/testdata/vector-divergences.json`）に、ケースキー
（`fn/note`）ごとの `reason` と、実際の（ピン留めされた）値または `throws: true` を宣言する。
`eval-vectors.json` にはこの仕組み自体が存在しない（厳格一致のみ）。

Go の実例（意図的な逸脱と、言語の制約による逸脱が両方ある）:

- `div/zero divisor yields Infinity` → Go は `0` を返す。「テンプレートのレンダーが `+Inf` を出すより
  生き残る方を選んだ」という**意図的な**縮退。
- `number/empty string coerces to 0` → JS では `Number('')` は `0` だが、Go は **意図的に** `NaN` を返す。
  「未設定の値が下流の算術を静かにゼロ化してしまうのを防ぐ」ため。
- `sort/localeCompare orders case-insensitively (ICU collation)` → Go の `strings.Compare` はバイト順序
  のみで、JS の ICU 照合順序を再現**できない**。これは言語ランタイムの限界であって意図的選択ではない。

「JS と違う」という同じ結果でも、理由が「意図的な設計判断」なのか「ホスト言語の制約」なのかは宣言の
`reason` で区別され、機械的には区別されない——読む人間のための情報。

## 依存の向きは reference-diff-testing と同じパターンを繰り返している

2026-07-03 に旧 `helper-vectors/` から現在の `vectors/` へ一級昇格し、各バックエンドのテストランナー内に
あったインラインの DIVERGENCES/UNSUPPORTED テーブルを言語非依存の JSON 宣言に切り出した
（`refactor(adapter-tests): promote golden vectors to a first-class JSON corpus with declared divergences`）。
その**翌日**の 2026-07-04、宣言ファイルをさらに `adapter-tests` パッケージから各バックエンド自身の
パッケージへ移動している——コミットメッセージに「adapter-specific test declarations don't belong in
adapter-tests」と明記。中央の `divergences.test.ts` は `packages/` 配下を歩いて `vector-divergences.json`
という決まった basename のファイルを**発見**する側に回った。新しいバックエンドを足しても、中央側の
コードは一切変えなくていい。

これは [[barefootjs-reference-diff-testing]] の `render-divergences.ts`（各アダプタが自分の既知の差分を
所有し、`adapter-tests`/`compat` はそれを名前で発見するだけ）と**全く同じ設計パターン**が、コンパイル
時（アダプタの IR→テンプレート lowering）と実行時（ランタイムのヘルパー関数・評価器）という独立した
2つのレイヤーで、それぞれ別個に育っている。

## 新しいバックエンド追加のコスト

`vectors/README.md` 曰く、新しいアダプタは「自分の言語で書いた**1つの**テストランナー」だけで完全な
適合性保証を得られる——TS/JS のツールは一切不要、コーパスはプレーンな JSON。ブートストラップ段階では
カタログの大半を `unsupported` にしてよく、それは失敗ではなく想定された初期状態として扱われる。

## [[barefootjs-bug-finding]] の中での位置づけ

fixture の値・構造を変える5手法とも、コンパイル時の [[barefootjs-reference-diff-testing]] とも別の
レイヤー。テンプレートの lowering が正しくても、それが呼び出すランタイムのヘルパー関数自体が JS と
違う値を返せば同じ結果にならない——golden vector コーパスはその土台を担保する。

## 出典

- `packages/adapter-tests/vectors/README.md`（piconic-ai/barefootjs, origin/main）
- `packages/adapter-tests/vectors/cases.ts`
- `packages/adapter-go-template/runtime/testdata/vector-divergences.json`
- コミット `87bf6b43f`（2026-07-03）、`a8dfcda09`（2026-07-04）

## 理解度チェック

```quiz
`vectors.json`（ヘルパー）と `eval-vectors.json`（評価器）とでは、どちらが JS との一致基準が厳しいか。
---
`eval-vectors.json`。真偽値は本物の boolean を要求し、数値と文字列の区別も保たれなければならず、
divergence 宣言も一切許可されない。`vectors.json` は value-compat（型が違っても値として等価なら合格）。
```

```quiz
Go の `number/empty string coerces to 0` の divergence は、意図的な設計判断か、言語の制約による逸脱か。
---
意図的な設計判断。JS では `Number('')` は `0` だが、未設定の値が下流の算術を静かにゼロ化してしまうのを
防ぐため、Go では意図的に `NaN` を返している。
```

```quiz
vector-divergences.json の宣言ファイルが、2026-07-04 に adapter-tests から各バックエンド自身の
パッケージへ移動したのはなぜか。
---
「アダプタ固有のテスト宣言は adapter-tests に属さない」という依存の向きを保つため。中央側は
basename でファイルを発見するだけにして、新しいバックエンドを足しても中央のコードを変えずに済むように
した。[[barefootjs-reference-diff-testing]] の render-divergences.ts と同じ設計パターン。
```

#barefootjs #testing
