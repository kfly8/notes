---
created: 2026-09-20
updated: 2026-09-20
title: 停止した Cloudflare Container が running 枠を握ったままになる
description: Cloudflare Containers のインスタンスが、アイドル停止したあともプラットフォーム側で「動いている」扱いのまま残ることがある。
tags: [cloudflare, containers, durable-objects, troubleshooting]
---
# 停止した Cloudflare Container が running 枠を握ったままになる

Cloudflare Containers のインスタンスが、アイドル停止したあとも**プラットフォーム側で「動いている」扱いのまま残る**ことがある。こうなると Durable Object は「コンテナは動いていて正常」と判断して起動をやり直さず、死んだポートへ中継し続ける。自然には直らず、数時間続いた。

未解決。2026-09 時点で観測した事実だけを書く。

## 2 通りの 500 として現れる

同じ原因が、どこから起動しようとするかで別のメッセージになる。

```
# 同じ Durable Object から。起動をスキップして死んだポートへ中継する
500 Error proxying request to container: The container is not listening in the TCP address 10.0.0.1:8080

# 別名の Durable Object から。max_instances に阻まれる
500 Failed to start container: Maximum number of running container instances exceeded.
```

紛らわしいが、起動そのものに失敗したときの `Failed to start container: The container is not listening in the TCP address ...` とは別物。あちらは起動を試みた結果で、`lite` の資源が足りずコールドスタートが readiness チェックに間に合わない、といった原因がある（[[cloudflare-containers]]）。こちらは**起動を試みてすらいない**（Durable Object が「もう動いている」と思っているため）ので、メッセージの頭が `Error proxying request to container:` になる。

後者が決め手になった。`max_instances = 1` の設定で、新しい名前の Durable Object から起動しようとすると上限超過で弾かれる。**停止したはずの古いインスタンスが枠を占有している**ということ。実際、新しい名前に切り替えてから最初の約 6 分間は上限超過で起動できず、古いインスタンスが解放された直後に起動して 200 を返すようになった。

`wrangler containers instances <app-id>` の表示は当てにならない。壊れている最中の STATE は `stopped` や `inactive` と出るのに、枠は握られたままだった。

## 発生の条件

観測した範囲では、**デプロイ（ロールアウト）後の最初のアイドル停止**で起きる。デプロイ直後の起動は成功し、`sleepAfter` を過ぎて止まった次のアクセスから 500 になる。

- 同じアプリで 3 回続けて再現した。
- 別のアプリでも起きた。特定のイメージやフレームワークに固有ではない。
- PID 1 に tini を置いても外しても起きる → [[container-pid1-sigterm]] とは無関係。最初は tini を疑って puma のイメージから外したが、外した状態のデプロイでまた詰まったので、そこで切り離せた。
- 毎回必ず起きるわけではない。デプロイ 1 回につき、16 個のうち 1 つが詰まる、くらいの頻度だった。詰まらずに何度も止まって起き直すデプロイもある。

Durable Object 側の様子も揃って壊れている。`Container` の状態は `healthy` のまま、`ctx.container.running` は true、そして **alarm が動かなくなる**ので、状態を取り直す機会が来ない。`wrangler tail` にはリクエストのエラーだけが並び、alarm のイベントが出てこない。

## 切り分け

同じイメージ・同じ設定の**別 Worker を workers.dev に立てて比べる**のが効いた。本番と同じイメージ（レジストリのダイジェストを直接指定）、同じ `lite`、ライフサイクルのログだけ足した写しで、次のどれでも再現しなかった。

- `sleepAfter` 30 秒 / 2 分で、停止と再起動を数サイクル
- 稼働中にイメージを差し替えるデプロイ（ロールアウト）を挟んでから、停止と再起動

これで、イメージ・Worker のコード・`instance_type`・`sleepAfter` のどれも原因ではないと言える。メモリも無関係だった（256MiB 上限に対して実測 55〜70MiB、30 並列でも増えない）。

ログを見るための写しには、`Container` のフックを上書きしてログを出させ、状態を RPC で覗く口を付けると分かりやすい。

```ts
export class MyContainer extends Container<Env> {
  sleepAfter = '30s'
  async debugState() {
    return { running: this.ctx.container?.running, state: await this.getState() }
  }
  onStop(params: unknown) { console.log('[debug] onStop', JSON.stringify(params)) }
  async onActivityExpired() {
    console.log('[debug] onActivityExpired', JSON.stringify(await this.debugState()))
    await super.onActivityExpired()
  }
}
```

この口自体がキャッシュされて同じ値を返し続けたことがあったので、`Cache-Control: no-store` を付けておく → [[cloudflare-workers-cache]]。

なお `wrangler dev` でのローカル再現は、Colima 環境では試せなかった。コンテナの通信を中継する `cloudflare/proxy-everything` が `setsockoptint: protocol not available` で即終了する（VM のカーネルに必要な機能がない）。

## 回避策の候補

| 手 | 効果 | 難点 |
|---|---|---|
| Durable Object の名前を変える（`idFromName` の引数） | 新しいインスタンスに移って復旧する | その場しのぎ。別のアプリでも起きるので、根本的には止まらない |
| `max_instances` を増やす | 枠を握られていても新しいインスタンスを起動できる | 握られたままのインスタンスが残ると費用が増える恐れ |
| `containerFetch` の失敗を見て `destroy()` してから起動し直す | 自動で復旧できる | プラットフォーム側の不整合を利用側で拭う形になる |

3 つ目は `Container` のサブクラスにすると、全アプリで同じ扱いにできる。

```ts
export class SelfHealingContainer<Env = unknown> extends Container<Env> {
  async fetch(request: Request): Promise<Response> {
    const replay = request.clone() as typeof request   // 本体を読む前に控えを取る
    const response = await super.fetch(request)
    if (response.status !== 500) return response
    if (!isStuckContainerResponse(response.status, await response.clone().text())) return response
    try { await this.destroy() } catch {}               // 握られたインスタンスに SIGKILL
    return super.fetch(replay)
  }
}
```

判定は「500 かつ本文に `The container is not listening` を含む」。`Failed to start container:` の 500 は別物（そちらは起動を試みた結果なので、やり直しても同じ）。判定だけを Workers ランタイムに依存しない関数に切り出しておくと、`bun test` で押さえられる。

## [[cloudflare-containers|Cloudflare Containers]]の中での位置づけ

こちらは利用側では直せない不整合。イメージ側で直せる停止漏れは [[container-pid1-sigterm]]。

## 理解度チェック

```quiz
Cloudflare Container が `The container is not listening in the TCP address ...` を返し続ける。Durable Object 側では何が起きているか。
---
`ctx.container.running` が true、状態が `healthy` のままなので、`containerFetch` が起動処理を飛ばして死んだポートへ中継している。alarm も止まっていて状態が更新されない。
```

```quiz
「停止したインスタンスが枠を握ったままである」と、どうやって確かめたか。
---
別名の Durable Object から起動しようとしたときに `Maximum number of running container instances exceeded`（`max_instances = 1`）で弾かれ、古いインスタンスが解放された直後に起動できた。インスタンス一覧の STATE は `stopped` と出ていて当てにならなかった。
```

#cloudflare #containers #durable-objects #troubleshooting
