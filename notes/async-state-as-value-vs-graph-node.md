---
created: 2026-09-21
updated: 2026-09-21
title: 非同期の「まだ無い」を値に置くか、グラフのノードの状態に置くか
description: signal ベースの UI で非同期データを扱うとき、「まだ来ていない」という状態をどこに置くかで設計が 2 系統に分かれる。
tags: [signals, async, solidjs, react, angular]
---
# 非同期の「まだ無い」を値に置くか、グラフのノードの状態に置くか

signal ベースの UI で非同期データを扱うとき、「まだ来ていない」という状態をどこに置くかで設計が 2 系統に分かれる。**値として持つ**（読み取りは同期で、pending / error は普通の値か分岐として現れる）か、**リアクティブグラフのノードの状態として持つ**（読み取りが throw して最寄りの境界が受ける）か。2026 年 9 月時点で後者を採るのは Solid 2.0 と React の `use()` だけで、他は前者に属する。

## 2 系統の対応表

| ライブラリ | 「まだ無い」の置き場 | 境界 | サーバー側 |
| --- | --- | --- | --- |
| Solid 1.x `createResource` | 値。`data.loading` / `data.error` は signal | `<Suspense>`（任意） | `initialValue` + `ssrLoadFrom` |
| Solid 2.0 `createMemo(() => fetch(id()))` | **ノードの状態**。未解決の読み取りは `NotReadyError` を throw | `<Loading>` / `<Errored>`（実質必須） | 同じグラフがサーバーでも走る |
| React `use(promise)` | **ノードの状態**。render が suspend する | `<Suspense>`（必須） | RSC |
| Angular `resource({ params, loader })` | 値。`value` / `status` / `error` / `isLoading` は signal | なし | `id` + TransferState |
| TanStack Query `useQuery` | 値。`status` / `fetchStatus` を持つ結果オブジェクト | なし | `initialData` + `staleTime` |
| Elm `RemoteData` | 値。`NotAsked \| Loading \| Failure e \| Success a` をモデルに置く | なし | — |

## Solid 2.0 が `createResource` を捨てられた理由

Solid 2.0 RC のリリースノートは、変更の核を「computation が Promise（または Async Iterator）を返せて、下流はそれを理解する」と書いている。1.x の `createResource` が 1 つの primitive に束ねていた仕事を分解すると、2.0 でそれぞれがどこに吸収されたかが分かる。

| 1.x の `createResource` の仕事 | 2.0 での行き先 |
| --- | --- |
| `source` を追跡して fetcher を再実行 | どの memo も依存を追跡するので、Promise を返す memo で足りる |
| 値を signal に持ち、`loading` / `error` / `latest` を生やす | ノード自体が「まだ無い」状態を持つ。`isPending` / `latest` はグラフレベルの読み取り |
| 最寄りの `<Suspense>` に登録して fallback を出させる | `NotReadyError` がグラフを伝播して `<Loading>` / `<Errored>` に届く |
| 再取得中に古い値を残す、transition との連携 | グラフが一貫した状態を自分で保つので `startTransition` / `useTransition` ごと削除 |
| SSR の直列化と hydration | `"use server"` の server function がコアに入り、直列化とストリーミングもコアが持つ |

1.x でもコンポーネントは再実行されていなかったので、足りなかったのは「グラフが pending を知っていること」だけだった。`createResource` と `<Suspense>` はその欠落を外付けで埋める装置で、2.0 は pending を「特別なノードの種類」から「どのノードも取りうる状態」に移した。だから特別なノードが要らなくなった。

これができた前提は 2 つある。**同じリアクティブグラフがサーバーでもクライアントでも走る**こと（サーバー側でも memo が Promise を返し、グラフが待ち、ストリームに書ける。seed を静的に描く必要がない）と、**ランタイムがスケジューリングを所有している**こと（ノードを保留し、古い値を保持し、揃ったら一貫した状態で commit する機構をコアに持った）。

代償も見えている。ランタイムのコアは大きくなり、rc.8 の時点で `isPending` と optimistic な値、Loading 境界の整合に関する issue が複数開いている。境界の外で読むと SSR ストリームが止まる、という報告もある（`<head>` 内の `<Title>` から非同期値を読んだケース）。fold を境界に委譲すると、境界の外の読み取りが未定義域になる。

## 値モデルはどこで勝つか

値モデルは書き味で劣る。派生 memo が pending を自動で継承せず、`user()?.name` のような畳みを著者が書く。

代わりに得るものは、**非同期の状態が普通の値なので、静的な解析・テスト・テンプレートへの変換の対象になる**こと。境界が無くても壊れず、読み取りは throw しない。同じグラフをサーバーで走らせられない環境（SSR を別言語のテンプレートで行う、など）では、そもそも前者の道が無い。[[barefootjs]] が値モデルを採る理由は [[barefootjs-async-layer0-design]] にまとめた。値モデルの中で「値があるか」と「最後のリクエストが決着したか」を分ける整理は [[async-value-and-settlement-axes]]。

## 理解度チェック

```quiz
Solid 2.0 が `createResource` を削除できたのは、何を「特別なノードの種類」から「どのノードも取りうる状態」に移したからか。
---
pending（まだ値が無い状態）。未解決の読み取りが `NotReadyError` を throw してグラフを伝播し、最寄りの `<Loading>` / `<Errored>` が受ける。
```

```quiz
「ノードの状態」モデルを採るための前提を 2 つ挙げよ。
---
同じリアクティブグラフがサーバーでも走ること（seed を静的に描かなくてよい）と、ランタイムがスケジューリング（保留・古い値の保持・一貫した commit）を所有していること。
```

```quiz
値モデルで、境界の外で非同期値を読んだら何が起きるか。
---
何も起きない。読み取りは throw せず、pending は普通の値として現れるので、境界が無くても壊れない。ノードの状態モデルでは境界の外の読み取りが未定義域になる。
```

## 出典

- [Solid 2.0 v2.0.0-rc.0 リリースノート](https://github.com/solidjs/solid/releases/tag/v2.0.0-rc.0)
- [Solid 2.0 と非同期 React（Zenn）](https://zenn.dev/r1013t/articles/37669abac10840)
- [TanStack Query v4: Queries](https://tanstack.com/query/v4/docs/framework/react/guides/queries)
- Angular の `packages/core/src/resource/api.ts` と `adev/src/content/guide/signals/resource.md`（GitHub の main ブランチ）
- Solid の issue #3379 / #3528 / #3529（rc.8 時点の `isPending` と境界の整合）

#signals #async #solidjs #react #angular
