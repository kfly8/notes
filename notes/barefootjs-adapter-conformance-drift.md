---
created: 2026-09-16
updated: 2026-09-16
title: 共有の適合性テストが複数バックエンド実装のドリフトを可視化する
description: 1つの中間表現（IR）から複数のバックエンド向けにコードを生成するコンパイラでは、各バックエンドの実装が互いに知らないうちに乖離していく。
tags: [barefootjs, testing]
---
# 共有の適合性テストが複数バックエンド実装のドリフトを可視化する

1つの中間表現（IR）から複数のバックエンド向けにコードを生成するコンパイラでは、各バックエンドの実装が互いに知らないうちに乖離していく。これを人間のレビューではなく、全バックエンドに同じフィクスチャを流す共有のテストスイートで機械的に検出する、という設計パターンについて。[[barefootjs]] のアダプタ適合性テストで実際に機能しているのを見た。

## BarefootJSのアダプタ構造

BarefootJSはJSXを一度バックエンド非依存のIRにコンパイルし、そこから各言語のテンプレート（Go `html/template`、Perl Mojolicious、Java Pebbleなど）へアダプタが変換する。2026年9月時点で10個のアダプタがある。

このうちTypeScript/Hono向けのHonoAdapterが**リファレンスアダプタ**という特別な位置づけを持つ。`packages/adapter-tests/fixtures/`の各フィクスチャの`expectedHtml`はHonoAdapterの実際の出力（実JS実行）から生成され、他の9アダプタの出力はすべてこの値と比較される。2つのアダプタが同じ問いに違う答えを出したときは、多数決でも「揃えやすい方」でもなく、機械的にHonoの答えが正解とされる。

各アダプタ固有の**既知の乖離**（表現力のギャップなど、正当な理由で追いつけていない差分）は`render-divergences.ts`にピン留めして明示的に許容する。ピン留めされていない差分はテスト失敗になる。

## 起きたこと: Pebbleだけが「卒業」に取り残されていた

モジュールスコープの純粋な関数・アロー定数をテンプレート内でベア名参照する（例: `{fmt(label)}`）シェイプは、Hono/CSR（実JS実行）なら普通に動くが、非JSのテンプレートエンジンには「そのクロージャを直接呼ぶ」手段が存在しない。この既知のギャップ（issue #2994）は最初、「コンパイルは通るがサイレントに空文字を返す」という既知の乖離として8個の非JSアダプタすべてに`render-divergences.ts`のピンとして記録されていた。

その後、この8アダプタは「コンパイル時に`BF101`エラーコードで明示的に拒否する」方式へ**卒業**した（issue #3011他）。サイレントに間違った出力を返すより、ロードに失敗する方が安全という判断で、`/* @client */`という既存のエスケープハッチへユーザーを誘導する。

Pebbleアダプタは開発時期の関係で別のGitブランチ上にあり、mainにこの卒業がマージされたときにはまだそこに合流していなかった。あとになってPebbleのブランチをmainへリベースしたところ、共有のフィクスチャスイート（`module-function-helper-chain`・`module-helper-boolcontext-call`）がPebbleに対してだけ即座に失敗した——Pebbleのコードは何も壊れていない（コンパイルには成功する）のに、期待される出力（BF101での拒否）と実際の出力（サイレントな空文字）が食い違っていた。

## なぜテストがなければ気づけなかったか

Pebbleのコード自体はエラーを出さず、正常にコンパイルが完了する。9個のアダプタそれぞれのemitterコードを人間が横に並べて「どれが最新のリファクタリングに追いついていないか」を目視で見つけるのは、この規模ではほぼ不可能に近い。

ここで機能したのは、**全アダプタに同一のフィクスチャ（同じソース・同じ期待値）を流し、答えが一致しない箇所だけを機械的に洗い出す**仕組みだった。8アダプタが新しい挙動へ揃った瞬間、Pebbleだけがそこから外れていることが、レビューを待たずにテスト実行1回で判明した。

## 明文化された設計哲学

BarefootJSのCLAUDE.mdには、この種の問題をひとつの原則として明記してある一節がある。

> One decision, two implementations, no test comparing them is the defect family this repo keeps producing. When you find a decision answered in more than one place, the deliverable is a single shared implementation the sites call — not an Nth copy that happens to agree today. A cross-adapter test pinning both families to the same answer for the same input is what makes the drift visible at all.

「同じ問いに対する答えが複数箇所にあり、それを比較するテストがない」状態そのものを繰り返し発生するバグの型として名指しし、対策は「共有実装にする」か「クロスアダプタテストで両者を同じ答えにピン留めする」のどちらか、としている。Pebbleの一件は、まさにこの原則が実地で機能した例になる。

## [[barefootjs]]の中での位置づけ

アダプタ間の適合性テスト（複数バックエンド実装のドリフト検出）を扱う。単一コンポーネントのIR構造を検証する`renderToTest()`とは別のテスト層になる。

## 理解度チェック

```quiz
`render-divergences.ts`への既知乖離のピン留めと、BF101でのコンパイル拒否は、それぞれどういう状態を表すか。
---
ピン留めは「コンパイルは成功するが、意図的に許容された理由でサイレントに間違った出力を返す」状態。BF101拒否は「そのシェイプ自体をコンパイル時に明示的に拒否する」、より安全な状態への「卒業」形。
```

```quiz
Pebbleアダプタの挙動の遅れは、どうやって発見されたか。人間のコードレビューだったか。
---
コードレビューではない。全アダプタに同一のフィクスチャを流す共有の適合性テストスイートが、Pebbleをmainへリベースした直後に、期待される出力（BF101拒否）と実際の出力（サイレントな空文字）の食い違いとして機械的に検出した。
```

## 出典

- [piconic-ai/barefootjs](https://github.com/piconic-ai/barefootjs) — `CLAUDE.md`、issue #2994 / #3000 / #3011 / #3012 / #3022

#barefootjs #testing
