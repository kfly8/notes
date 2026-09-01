---
created: 2026-09-01
updated: 2026-09-01
title: BarefootJS の adversarial value catalog
description: 型ごとに壊れやすい代表値をカタログ化し、既存 fixture の props を1プロパティずつ置き換えて壊れないか 検証する仕組み。
tags: [barefootjs, testing]
---
# BarefootJS の adversarial value catalog

型ごとに壊れやすい代表値をカタログ化し、既存 fixture の props を1プロパティずつ置き換えて壊れないか
検証する仕組み。`packages/adapter-tests/src/adversarial-catalog.ts`（2026-07-13、`spec/subset-conformance.md`
ロードマップの stage 3）。IR の `propsParams` から得た各 prop の `TypeInfo` を、対応する値セットに
マッピングして生成する。

## 型ごとのカタログ

- string: 空文字列(`empty`)、マークアップ混じり(`markup`, `<b>&"'</b>`)、マルチバイト(`multibyte`, 日本語)
- number: ゼロ(`zero`, 0)、負数(`negative`, -7)、大きい値(`large`, 1234567890)
- boolean: `true` / `false`
- array: 空配列(`empty`)
- optional な prop 全般: 値そのものを省略する `absent` も1点として加わる
- Date（#2274 で追加）: epoch、1969年のuncrewed pre-1970（`1969-07-20T20:17:40.123Z` — 負エポックの
  floor-division に罠がある）、うるう日(`2024-02-29`)、9999年（4桁年境界）。実際の `Date` は committed
  な JSON に残せないので `{$date: ISO文字列}` というエンベロープで運び、レンダー直前に実体化する。
- union（#2277 で追加）: リテラルメンバー（string/boolean/null/numeric）1つにつき1点。メンバーが12件
  （`UNION_MEMBER_CAP`）を超える場合は先頭6件+末尾6件にサンプリングする——境界（最初/最後のケースを
  特別扱いする `switch` 等）の不具合が出やすい両端を優先する設計。非リテラルメンバー（bare な
  `string`型のメンバーなど）は合成できる値がないためスキップされ、v1スコープでは未カバーのまま残る。
- object/interface（#2277 で追加）: 必須フィールドのみの "minimal" な点と、オプションフィールドを1個
  だけ "present" にした点を1フィールドずつ（クロスプロダクトはしない）。ネストは深さ3
  （`OBJECT_DEPTH_CAP`）で打ち切り、それ以上ネストしたフィールドは空オブジェクト `{}` で埋める。

## OFAT（one-factor-at-a-time）であって全組み合わせではない

既存 fixture の props のうち1つだけをカタログの値に差し替える。全組み合わせ（cross-product）は意図的に
避けている——同じ lowering を何度も再テストするだけで組み合わせ爆発する、という判断（docstring の
"axis sampling — the cross-product would explode and mostly re-test the same lowering" より）。
[[pairwise-testing]] は後から「2軸の組み合わせ」を狙う別レイヤーとして追加されたもので、
adversarial-catalog の役割とは重ならない。

生成された点は `generated-data-points.json` という committed artifact に書き出され（suite 登録時に
毎回計算するのではなく、事前生成・レビュー可能な diff・`skipDataPoints` での安定した命名を優先した設計）、
既存の宣言的な data point と同じオラクル（JS リファレンス render との比較）を通る。

## 意図的な対象外（v1時点）

非整数 number（bare な `number` prop は他に根拠がなければ Go の `int` に lower されるため、小数値は
意味的な差異ではなくハーネス側のエラーになってしまう、#2168）、astral-plane 文字列（アダプタごとに手で
ピン留め済み、#2255）、関数型 prop（合成できる値がない）、非リテラル union・デフォルト値のない
`unknown` 型必須フィールドはスコープ外として明記されている。将来のカタログ拡張候補。

## [[barefootjs-bug-finding]] の中での位置づけ

既存の249フィクスチャ（IR 適合性の全量コーパス）に対する境界値チェック。構造は変えず、値だけを型ごとの
既知の壊れやすいパターンに差し替える、という一番浅いレイヤー。

## 出典

- `packages/adapter-tests/src/adversarial-catalog.ts`（piconic-ai/barefootjs, origin/main, 2026-07-13）

## 理解度チェック

```quiz
adversarial-catalog が pairwise のような全組み合わせ（cross-product）を避けているのはなぜか。
---
同じ lowering を何度も再テストするだけで組み合わせ爆発するため。既存 fixture の props を1つずつ変える
OFAT（one-factor-at-a-time）に留めている。
```

```quiz
union 型のカタログで、メンバーが12件を超えるとき先頭6件+末尾6件だけをサンプリングするのはなぜか。
---
`switch` 文などで最初/最後のケースだけ特別扱いされるような境界の不具合が、宣言順の両端で最も出やすい
という判断から。
```

#barefootjs #testing
