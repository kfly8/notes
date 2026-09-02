---
created: 2026-09-01
updated: 2026-09-02
title: BarefootJS の問題発見手法
description: BarefootJS でバグ・設計の穴を見つけるためにこれまで使われてきた手法の見取り図。
tags: [barefootjs, testing, moc]
---
# BarefootJS の問題発見手法

[[barefootjs]] でバグ・設計の穴を見つけるためにこれまで使われてきた手法の見取り図。ヒューリスティックな
探索から、構造化されたテスト設計へと、2026年7月〜9月にかけて急速に積み上がった。

## 時系列

- 2025-12〜2026-04: Counter/Toggle/Todo/AI Chat の基本サンプル、shadcn/ui 移植（60種類以上）、
  Spreadsheet・Graph/DAG エディタなどのミニツール、複数 UI コンポーネントを組み合わせたブロック。
  **ヒューリスティックな探索**——何か作ってみて壊れたら直す。
- 2026-04〜06: `examples` → `integrations` へ改称、Go（Gin/Chi/net/http）を含む複数アダプタ対応が
  本格化。拡張そのものが設計の穴を露見させた実例として、Date 型が Go では `interface{}` にサイレント
  パススルーしていた問題（#2273/#2274）がある。
- 2026-07-03〜04: [[barefootjs-golden-vectors]]（ランタイムのヘルパー関数・`ParsedExpr` 評価器コーパス）
  を一級ディレクトリへ昇格し、各バックエンドの既知の逸脱を自分のパッケージ内の JSON 宣言に切り出す。
- 2026-07-13: 同日に2つの機構が入る——[[coverage-floor]]（IR の種類×軸の受理カバレッジを計算で担保）
  と [[barefootjs-adversarial-catalog]]（型由来の境界値を OFAT で既存 fixture に適用）。
- 2026-08-26: [[barefootjs-mutation-sweep]]（意味保存構造変換によるメタモルフィックテスト）。
- 2026-08-28: [[pairwise-testing]] t=2 実装（5軸・97ケースの covering array、オラクル、quarantine）。
- 2026-08-31〜09-01: pairwise の t=3 部分昇格（壊れやすい3軸に354ケース追加、計451ケース）。

## 各手法の位置づけ

| 手法 | 何を変える/固定するか | 対象コーパス | 判定方法 |
|---|---|---|---|
| [[coverage-floor]] | 何も変えない。IR の種類×軸の受理範囲が fixture で実際にカバーされているかを計算で検査 | 249件（全量コーパス） | fixture の存在有無（allowlist の縮小専用運用） |
| fixture の `expectedHtml` 固定 | 何も変えない。アダプタ出力を凍結して差分検知 | — | 文字列比較（宣言済みの差異は許容） |
| [[barefootjs-adversarial-catalog]] | 既存 fixture の props を型由来の値に1つずつ置き換える（OFAT） | 249件（全量コーパス） | コンパイル可否・出力 |
| [[barefootjs-mutation-sweep]] | 既存 fixture の構造を意味保存変換で変える | 41件（shared fixture） | oracle-core.ts の3オラクル |
| [[pairwise-testing]] | 5軸の値を新たに組み合わせて新しい fixture を生成する（t=2、壊れやすい軸は t=3） | 新規生成（97〜451ケース） | oracle-core.ts の3オラクル（mutation sweep と共有） |

coverage-floor と adversarial-catalog は249件の全量コーパス（IR 適合性）が対象、pairwise / mutation は
41件の shared fixture（全アダプタ共通でブラウザ実行できるもの）が対象。粒度も対象コーパスも異なる、
別レイヤーの検証を並行して積んでいる。

「壊れやすい軸」の扱いにも一貫性がある。adversarial-catalog は非整数 number や astral-plane 文字列を
「価値が低い／別の方法で担保済み」として明示的にスコープ外にし、pairwise の t=3 昇格は逆に「バグの
実績が多い軸（構造・イベント・コールバック形状）」を名指しで狙い撃ちする。どちらも network を広げず、
根拠に基づいて狙いを絞る判断をしている。

## 「fixture を実行して観測する」以外の3レイヤー

上の5手法はどれも fixture を実行して壊れを観測するテストだが、それとは別に3つのレイヤーがある。

- [[barefootjs-exhaustive-adt]]: IR を discriminated union（ADT）で定義し、種類を拡張したときの
  アダプタ側の実装漏れを**コンパイル時**に検出する。テストを書く前に壊れた状態そのものを型で作れなく
  する予防線。
- [[barefootjs-reference-diff-testing]]: Hono（TypeScript/JS）をリファレンス実装とし、同じ入力を他の
  全アダプタでもレンダーしてライブに突き合わせる差分オラクル。コンパイル時の IR→テンプレート lowering
  が対象。「コンパイルは通るのに出力が違う」というサイレントな分岐を trichotomy で明示的に許さない
  設計になっていて、既知の差分は各アダプタパッケージ自身が `render-divergences.ts` として所有する
  （adapter-tests 自体は個々のアダプタの知識を持たない）。
- [[barefootjs-golden-vectors]]: reference-diff-testing のさらに手前、**実行時**のネイティブランタイム
  （テンプレートが呼ぶヘルパー関数・式評価器）を JS の挙動と値レベルで突き合わせる。既知の差分の所有
  方法は reference-diff-testing と全く同じパターン（各バックエンドパッケージが `vector-divergences.json`
  を自分で持ち、中央は basename で発見するだけ）を、独立したレイヤーで再現している。

exhaustive-adt は「実装漏れ」をコンパイル時に、reference-diff-testing はコンパイル時の lowering が
「実装済みだが出力が違う」ことを、golden-vectors はさらに手前の実行時ランタイムの値のズレを捉える。
3つとも、fixture を追加・改変する5手法とは独立に、常時効いている基盤。

## まだできていないこと

- **生成ベースの structure-aware fuzzing** が手つかず。[[structure-aware-fuzzing]] にまとめた Gleam
  コンパイラの smith のように、JSX/コンポーネント構造をゼロから型安全に確率的生成する仕組みはない。
  今あるのはすべて「既存 fixture への改変」（値の置換・構造変換・組み合わせ）で、新しい構造そのもの
  を生成する段階には至っていない。
- mutation sweep の変換は3種類（alias-props/fragment-wrap/block-body）のみで、
  [[structure-aware-fuzzing]] で fitzgen が行ったような「生成と変異のどちらが効くか」の比較検証は
  していない。
- LLM にドキュメントに沿ってオンボーディングさせて評価する、という手法は実装を確認できなかった。

## 出典

- piconic-ai/barefootjs（origin/main, 2026-09-02時点）

## 理解度チェック

```quiz
adversarial-catalog / coverage-floor と、pairwise / mutation sweep とでは、対象にしている fixture の
規模が違う。それぞれ何件が対象か。
---
adversarial-catalog と coverage-floor は249件の全量コーパス（IR 適合性）、pairwise と mutation sweep は
41件の shared fixture（全アダプタ共通でブラウザ実行できるもの）が対象。
```

```quiz
BarefootJS の問題発見手法で、現時点でまだ手つかずなのはどんなアプローチか。
---
生成ベースの structure-aware fuzzing。既存 fixture の値や構造を変える手法はそろっているが、
コンポーネント構造そのものをゼロから確率的に生成する仕組みはまだない。
```

```quiz
exhaustive-adt / reference-diff-testing / golden-vectors の3レイヤーは、それぞれ何を、どの段階で捉えるか。
---
exhaustive-adt は IR の種類拡張時のアダプタ実装漏れをコンパイル時に、reference-diff-testing はコンパイル
時の IR→テンプレート lowering の出力差分を、golden-vectors はさらに手前の実行時ネイティブランタイム
（ヘルパー関数・式評価器）の値のズレを捉える。
```

#barefootjs #testing #moc
