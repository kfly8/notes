---
created: 2026-09-20
updated: 2026-09-20
title: Cloudflare Containers の費用は Durable Object の稼働時間として出てくる
description: Cloudflare Containers のコンテナは 1 台ごとに Durable Object と紐づいていて、コンテナが動いている間、その DO も「稼働中」として課金される。
tags: [cloudflare, containers, durable-objects, billing]
---
# Cloudflare Containers の費用は Durable Object の稼働時間として出てくる

Cloudflare Containers のコンテナは 1 台ごとに Durable Object と紐づいていて、**コンテナが動いている間、その DO も「稼働中」として課金される**。コンテナ側の vCPU・メモリ・ディスクだけを見ていると、請求の内訳で Durable Objects Compute Duration のほうが大きくなっていて驚く。

紐づきは `@cloudflare/containers` の実装でそうなっている。alarm ハンドラの中で、コンテナが動いている間は `setTimeout` を await して DO を意図的に起こしたままにしている。

```js
// node_modules/@cloudflare/containers/dist/lib/container.js
// await a sleep for maxTime to keep the DO alive for at least this long
await new Promise(resolve => {
  this.resolve = resolve
  if (!this.container.running) { resolve(); return }
  this.timeout = setTimeout(() => { resolve() }, timeout)
})
```

実測でも一致する。16 個のコンテナを 3 週間ほど動かしたアカウントで、DO duration 416.22k GB-s をインスタンスあたり固定の 128MB で割ると約 3.3M 秒。同じ期間のコンテナメモリ 839.3k GiB-s を lite の 256MiB で割ると約 3.4M 秒で、ほぼ同じだった。つまり **DO duration ≒ コンテナが起きていた秒数**。

## 減らすつまみはコンテナの稼働時間しかない

DO duration の GB-s は「128MB × 稼働秒」で決まる。DO 側でできる工夫（ストレージの使い方など）は関係ない。減らしたければコンテナが起きている時間を短くするしかない。

- `sleepAfter` を短くする（コールドスタートとの取引）
- レスポンスをキャッシュしてコンテナまでリクエストを届かせない → [[cloudflare-workers-cache]]
- クローラーを締め出す（robots.txt、WAF のボット対策）
- PID 1 がシグナルを無視して止まらなくなっていないか確かめる → [[container-pid1-sigterm]]

無料枠は 400,000 GB-s/月。128MB 固定なので **約 870 時間/月**、つまり平均 1.2 台が常時起きている状態が上限の目安になる。

## 無料枠を超えた日だけグラフが跳ねる

DO duration の超過分は $12.50/100万 GB-s だが、公式の料金ページに「課金対象の使用量は、次の課金単位に切り上げてから単価を掛ける」とある。単位は 100万 GB-s なので、**超過が 16.22k GB-s でも 1 単位分がまるごと請求される**（定価換算なら $0.20 のところが $12.50）。

ダッシュボードの日別グラフでは、この 1 単位分が「無料枠を使い切った日」に丸ごと計上される。その日だけ使用量が急増したように見えるが、実際には毎日ほぼ一定で、累計が 400k GB-s を超えた日に初めて金額が付いただけ、ということが起きる。

見分け方は単純で、**課金対象の使用量と金額から実効単価を出す**。定価の $0.0000125/GB-s から大きく外れて高ければ、それは切り上げの 1 単位分であって、その日の使用量が跳ねたわけではない。同じ日にコンテナ側（メモリ・vCPU）の費用が平常どおりなら、なおさら使用量は動いていない。

コンテナの費用（GiB 秒）のほうは切り上げられず、そのまま比例して課金されていた。同じ請求書でも項目によって扱いが違う。

## [[cloudflare-containers|Cloudflare Containers]]の中での位置づけ

費用がどこに現れるかの話。止まらない原因は [[container-pid1-sigterm]]、止まったのに枠を握られる話は [[cloudflare-containers-stuck-running-slot]]。

## 理解度チェック

```quiz
コンテナがアイドルで止まっているのに Durable Objects Compute Duration が増え続けている。まず何を疑うか。
---
コンテナが実は止まっていないこと。DO はコンテナが動いている間ずっと起きているので、DO duration ≒ コンテナの稼働秒数になる。PID 1 が SIGTERM を無視して止まらないケースが典型。
```

```quiz
日別の費用グラフで、ある 1 日だけ Durable Objects の金額が跳ね上がっていた。使用量が急増したと判断してよいか。
---
よくない。課金対象の使用量と金額から実効単価を出し、定価（$12.50/100万 GB-s）より大きく高いなら、無料枠を超えた日に 100万 GB-s 単位へ切り上げられた 1 単位分がまとめて計上されただけの可能性が高い。
```

## 出典

- [Durable Objects — Pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Containers — Pricing](https://developers.cloudflare.com/containers/pricing/)

#cloudflare #containers #durable-objects #billing
