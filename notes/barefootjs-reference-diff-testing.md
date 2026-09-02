---
created: 2026-09-02
updated: 2026-09-02
title: BarefootJS のリファレンス実装との差分テスト
description: 各アダプタ（Go/Perl/Rust などの DSL テンプレート）の出力を、Hono アダプタ（TypeScript/JS、実質 リファレンス実装）の出力とライブに突き合わせ、一致しない箇所を見つける仕組み。
tags: [barefootjs, testing]
---
# BarefootJS のリファレンス実装との差分テスト

各アダプタ（Go/Perl/Rust などの DSL テンプレート）の出力を、Hono アダプタ（TypeScript/JS、実質
リファレンス実装）の出力とライブに突き合わせ、一致しない箇所を見つける仕組み。事前に固定した期待値
との単発比較とは別に、「同じソースを2つの経路でレンダーして食い違いを見る」という差分オラクル。

（このリポジトリで「golden vector」と呼ばれるのはこの節の `expectedHtml` ではなく、実行時のランタイム
ヘルパー・式評価器を対象にした別のコーパス——[[barefootjs-golden-vectors]] を参照。）

## `referenceAdapter` によるライブ比較

`packages/adapter-tests/src/jsx-runner.ts` の `runJSXConformanceTests` は、`referenceAdapter` /
`referenceRender` が渡されると、テスト対象アダプタと基準アダプタの両方で同じ fixture をレンダーし、
双方を `normalizeHTML` で正規化してから `expect(normalizedHtml).toBe(normalizedRefHtml)` と完全一致を
要求する。渡されなければ、事前生成された `fixture.expectedHtml` と比較する。`packages/compat` の
クロスアダプタテストでは `hono` を `referenceAdapter` として扱う。

## no-silent-divergence trichotomy: 3番目の状態を許さない

`packages/jsx/src/__tests__/map-body-no-silent-divergence.test.ts`（`.map()` コールバック本体の形状が
対象）が明文化している設計原則: あらゆる入力の形状について、次の3つのうち**必ずどれか1つ**でなければ
ならない。

1. クリーンにコンパイルでき、出力される client bundle も健全（プレーンな JS としてパースできる、
   生の JSX や compiler 内部の sentinel が漏れていない）
2. コンパイラが `BF` エラーコードで**大声で**（loud）拒否する
3. （許されない）クリーンにコンパイルできるのに、壊れた bundle を出す——**静かに開いた穴**（silent hole）

3番目が「テストで検出すべきバグ」の定義そのもの。`KNOWN_HOLES` という**縮小専用**のリストに現在の穴を
列挙し、直ったエントリをテストが消し忘れなく検出する（[[pairwise-testing]] の
quarantine と同じ「登録した穴が塞がったら気づける」設計）。この trichotomy の考え方自体は `.map()`
コールバックに限らず、リファレンスとの差分検証全体に通底している。

## `render-divergences.ts`: 既知の差分は各アダプタが自分で持つ

各アダプタパッケージ（`packages/adapter-{go-template,erb,jinja,...}/src/render-divergences.ts`）が、
「コンパイルは通るが Hono リファレンスと出力が食い違う」既知の fixture を、原因調査つきで自分自身の
パッケージ内に宣言する。

具体例（Go アダプタ、いずれも実際にリファレンスとの差分から見つかったバグ）:

- `children-passthrough-renamed`（#2788）: `children` prop を別名で destructure する
  （`const { children: kids } = props`）と、Go の SSR テンプレートに値が届かない。
- `signal-object-spread-init`（#2700）: オブジェクトリテラルを値に持つ signal は、Go だけ
  `NewXxxProps` コンストラクタ内で静的にしか値を焼き込めず、prop を参照する式が来ると `nil` になる。
- `textarea-row-breakout`（#2794）: モジュールレベルの `const` 文字列から初期化した signal が、Go の
  値焼き込みロジックでは識別子解決の対象外で `nil` になる。
- `nested-loop-ref-const`（#2800）: signal が持つオブジェクト配列の要素にさらにネストした配列プロパティ
  があると、Go の struct 合成が全体を諦めて `nil` を返し、`{{range}}` の中身が空になる。

これらは同じファイルの冒頭コメントで「直って卒業した」ケースも記録している——#2630 の divergence は
テストハーネス側の不備（アダプタは悪くなかった）と判明して解消、#2703 の divergence はサイレントな
誤出力から「大声の `BF101` 拒否」への再分類で trichotomy の2番目に移った、という具合に、直った理由
まで含めて残される。

## adapter-tests は各アダプタの知識を持ち込まない

`run-adapter-conformance.ts` は「**per-adapter conformance の唯一の必須エントリーポイント**」で、
docstring 曰く「adapter authors do not choose which suites to run — they only declare what to skip」。
新しい conformance suite を足す場所は1箇所（このファイル）で、既存の全アダプタが次のテスト実行で自動的
にそれを拾う。

`render-divergences` や `conformancePins`（「大声で拒否している箇所」の宣言）は、中央の `adapter-tests`
や `compat` パッケージ側にハードコードするのではなく、各アダプタパッケージが**自分のこととして**
所有する。`escape-coverage.test.ts` のコメントが増築の経緯まで書いている——最初は `compat` 側に
「adapter/fixture 文字列を112件」ハードコードしていたが、これは「アダプタパッケージが自分の欠落を語る」
という他の場所全体の依存の向きを逆転させてしまっていた。9個目のアダプタを追加するコミュニティメンバー
が、コアの `compat` テストを編集せずに済むよう、宣言をアダプタ側のオブジェクトに移した。**新しい
アダプタを足しても、既存のテストコードは1行も変えなくていい**、という設計。

## [[barefootjs-bug-finding]] の中での位置づけ

fixture の値や構造を変える他の手法（[[barefootjs-adversarial-catalog]]・[[barefootjs-mutation-sweep]]・
[[pairwise-testing]]）は「1つの実装が自分自身と矛盾しないか」を見るのに対し、これは「複数の実装が
同じ入力に対して同じ結果を出しているか」を見る、別方向のオラクル。[[barefootjs-exhaustive-adt]] が
「実装漏れ」をコンパイル時に防ぐのに対し、これは「実装済みだが出力が違う」を実行時に検出する。

## 出典

- `packages/adapter-tests/src/jsx-runner.ts` / `run-adapter-conformance.ts`（piconic-ai/barefootjs, origin/main）
- `packages/jsx/src/__tests__/map-body-no-silent-divergence.test.ts`
- `packages/adapter-go-template/src/render-divergences.ts`
- `packages/compat/src/__tests__/escape-coverage.test.ts`

## 理解度チェック

```quiz
no-silent-divergence trichotomy で、テストが本当に検出すべき「許されない状態」はどれか。
---
コンパイルはクリーンに通るのに、壊れた client bundle を出す状態（silent hole）。コンパイルが
拒否するのも、正しく動くのも、どちらも許される状態。
```

```quiz
render-divergences の宣言が、中央の compat パッケージではなく各アダプタパッケージ側に置かれているのはなぜか。
---
「アダプタパッケージが自分の欠落を自分で語る」という依存の向きを保つため。以前は compat 側に
adapter/fixture の組をハードコードしていたが、新しいアダプタを追加するたびにコアのテストを編集する
必要があり、その依存の向きを逆転させていた。
```

#barefootjs #testing
