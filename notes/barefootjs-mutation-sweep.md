---
created: 2026-09-01
updated: 2026-09-01
title: BarefootJS の mutation sweep
description: 意味を保つはずの構造変換をコンポーネントのソースに適用し、変換前後でレンダリング結果が変わらないことを 検証する、メタモルフィックテスト。
tags: [barefootjs, testing]
---
# BarefootJS の mutation sweep

意味を保つはずの構造変換をコンポーネントのソースに適用し、変換前後でレンダリング結果が変わらないことを
検証する、メタモルフィックテスト。`packages/adapter-tests/mutation/mutations.ts`（2026-08-26、#2481
"mutation sweep v1"）。

名前は「mutation」だが、プロダクトコードにバグを注入してテストの検出力を測る古典的な mutation testing
ではなく、意味を保つ変換の前後で出力不変性を見る**メタモルフィックテスティング**にあたる。すべて
`ts.transform` によるTS ASTレベルの変換で、正規表現によるソース書き換えは使わない（このリポジトリの
コンパイラ規約）。

## 3種の変換

- **alias-props**: 単一パラメータを取るコンポーネントに限り、destructure された各 prop（あるいは
  `props` 丸ごとのパラメータ）に対して `const x__alias = x` を挿入し、本体内の全参照（ネストした
  クロージャ内も含む）を alias へ書き換える。狙いは #2468 系の CSR スコープリーク — 名前で解決する
  ランタイムだと、本体に直接名が出なくなった時点で誤った binding を読む可能性がある。shadowing
  （let/const/catch/for ループ変数、hoist される function/class 宣言）は宣言のある文だけでなく、その
  宣言を含む**ブロック全体**（TDZ セマンティクス）に対して効かせる — ブロック内の後続の文だけを
  shadow 対象にすると、実際にはそのブロックのローカルを指す前方参照まで書き換えてしまい、意味保存が
  壊れるため（#2725 の Copilot レビュー指摘）。shorthand プロパティ（`{x}`）は `{x: x__alias}` に
  昇格させる。
- **fragment-wrap**: コンポーネントのルート JSX を `<>...</>` で包む。JsxExpression（`{<jsx/>}`）では
  なく直接の JsxChild として挿入するのが要点——`{}` で包むとコンパイラが動的スロット経路に回して
  しまい、fragment-wrap という静的な構造変換そのものの検証にならなくなる、という #2725 の Copilot
  レビュー指摘があった。
- **block-body**: `return (<jsx>)` を `{ const __root = (<jsx>); return __root }` に変換する。2つの文を
  そのまま囲みブロックへ展開するのではなく、ネストした新しいブロックにするのが設計上のポイントで、
  `if`/`for`/`case` 節の中など、`ReturnStatement` が置ける構文位置ならどこでも同じ変換が安全に使える
  （挿入先がどんな構文形か個別に判定しなくてよい）。

いずれも、ループの行テンプレートを作るネストしたクロージャの `return` はコンポーネントのルートとは
別物として除外し、書き換えない。`MUTATIONS_V1 = [aliasProps, fragmentWrap, blockBody]` として export
される。

## 規模と分類

41件の shared fixture × 3 mutations = 123 (fixture, mutation) ペア。`ok` / `refused`（コンパイラが診断で
拒否＝合格扱い）/ `broken`（診断なしでクラッシュ・空出力＝本物の不具合）/ `inapplicable`（適用サイト
なし）の4分類で manifest に記録する。ブラウザ側オラクルの実行コストが PR ごとには見合わないため、
ナイトリー限定（`.github/workflows/mutation-sweep.yml`、cron `'0 4 * * *'`）。

## オラクルは pairwise sweep・frozen corpus と共有

`e2e/oracle-core.ts` は「frozen corpus 向けの `oracle.playwright.ts` から**そのまま抽出した**」実装だと
docstring に明記されており、`runThreePointOracle` / `runSnapOracle` / `runIdempotenceOracle` の3関数を
frozen corpus・[[pairwise-testing]]・mutation sweep の3つの sweep が同一実装として import して使っている。
「何を入力として作るか（fixture 固定 / pairwise 組み合わせ / 構造変換）」と「壊れたかどうかをどう判定
するか（オラクル）」が分離された設計になっている。

## [[barefootjs-bug-finding]] の中での位置づけ

fixture の中身（props の値）ではなく構造そのものを変える点で、[[barefootjs-adversarial-catalog]]
（値を変える）や [[pairwise-testing]]（既存の軸の値を組み合わせて新しい fixture を作る）とは別レイヤー。

## 出典

- `packages/adapter-tests/mutation/mutations.ts`（piconic-ai/barefootjs, origin/main, 2026-08-26）
- `.github/workflows/mutation-sweep.yml`

## 理解度チェック

```quiz
alias-props 変換で、shadowing をブロック全体（TDZ セマンティクス）に対して効かせているのはなぜか。
---
ブロック内の後続の文だけを shadow 対象にすると、実際にはそのブロックのローカル変数を指しているはずの
前方参照まで alias に書き換えてしまい、意味保存が壊れるから。
```

```quiz
fragment-wrap 変換で、`<jsx/>` を JsxExpression（`{}`）で包まず直接の JsxChild として挿入しているのはなぜか。
---
`{}` で包むとコンパイラが動的スロット経路に回してしまい、fragment-wrap という静的な構造変換そのものの
検証にならなくなるから。
```

```quiz
「mutation sweep」という名前だが、実体としてはどのテスト手法に近いか。
---
プロダクトコードにバグを注入してテストの検出力を測る古典的な mutation testing ではなく、意味を保つ変換
の前後で出力が変わらないことを見るメタモルフィックテスティングに近い。
```

#barefootjs #testing
