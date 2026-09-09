---
created: 2026-09-07
updated: 2026-09-09
title: "BarefootJS: GoアダプタのテストはローカルのGoが古いと黙ってスキップされる"
description: packages/adapter-go-templateのテストはgo runで実際にGoコードをコンパイル・実行して検証するが、ローカルのGoバイナリがgo.modの要求バージョン(1.25+)を満たさないとGoNotAvailableErrorで早期returnし、アサーション無しのまま「パス」に見える。CI側のGoが十分でも、ローカルの緑を信用すると実在するバグを見逃す。
tags: [barefootjs, testing, go]
---
# BarefootJS: GoアダプタのテストはローカルのGoが古いと黙ってスキップされる

[[barefootjs]]の`packages/adapter-go-template`は、テスト自体が生成したGoソースを`go run`で実際にコンパイル・実行してHTML出力を検証する(モックではない)。この検証は`isGoAvailable()`(`packages/adapter-go-template/src/test-render.ts`)がローカルの`go version`を見て「使えるかどうか」を判定した上で行われる。

## 何が起きるか

`isGoAvailable()`は`go.mod`が要求するバージョン(`packages/adapter-go-template/runtime/go.mod`で`go 1.25.6`)を満たさないローカルのGoを検出すると`false`を返し、レンダー関数は`GoNotAvailableError`を投げる。テストコード側は各所で

```ts
if (err instanceof GoNotAvailableError) return
```

としてこれを捕まえ、アサーションを一切実行せずに**早期returnで正常終了**する。`test.skip`のような明示的なスキップ表示にはならず、テストランナー上は他のテストと同じ「パス」として見える。

つまり、ローカルのGoバイナリがバージョン要件を満たさない環境(このセッションでは`1.24.7`)で`bun test`を実行すると、Goテンプレート関連のテストが**実質何も検証しないまま緑になる**。CI側は要件を満たすGoが入っているため同じテストが本当に実行されて赤くなる差分が生まれ、「ローカルでは通っていたのにCIで落ちた」の原因になり得る。

## 実際に踏んだ実害

この挙動が、モジュールレベルの配列/オブジェクトリテラルconst(`const INITIAL: Row[] = [...]; createSignal(INITIAL)`)をGoアダプタのsignal初期値として使うと`nil`にベイクされてしまう不具合([piconic-ai/barefootjs#2862](https://github.com/piconic-ai/barefootjs/issues/2862))を、ローカルでの事前検証では検出できない原因になった。CI(`CI — Go Template Adapter`ワークフロー)で初めて赤くなって発覚した。

## 教訓

Goアダプタ関連の変更を検証するときは、まず`go version`でローカルの実効バージョンが`go.mod`の要求を満たしているか確認してから「テストが緑だった」を信用する。満たしていない場合、`go`コマンド自身にツールチェインを自動取得させる(`GOTOOLCHAIN`環境変数)か、CIの結果が出るまでローカル検証の緑を過信しない。

## 理解度チェック

```quiz
GoNotAvailableErrorを捕まえて早期returnするテストは、ローカルのGoが要件を満たさないとき、テストランナー上どう見えるか?
---
明示的なスキップ表示にはならず、アサーションを一切実行しないまま正常終了するので、他のテストと同じ「パス」として見える。
```

```quiz
なぜこの挙動が「ローカルでは通っていたのにCIで落ちた」の原因になり得るのか?
---
ローカルのGoバージョンが要件未満だとテストが実質何も検証せずに緑になる一方、CIには要件を満たすGoが入っているため同じテストが本当に実行され、ローカルでは見えなかった不具合がCIで初めて赤として現れるため。
```

## 出典

- `packages/adapter-go-template/src/test-render.ts`(`isGoAvailable`/`GoNotAvailableError`)、`packages/adapter-go-template/runtime/go.mod` — 一次情報(`@barefootjs/adapter-go-template`、2026-09時点のmain)。
- 実際にこの挙動を踏んで発覚した不具合: [piconic-ai/barefootjs#2862](https://github.com/piconic-ai/barefootjs/issues/2862)

#barefootjs #testing #go
