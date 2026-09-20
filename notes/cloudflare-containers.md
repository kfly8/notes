---
created: 2026-09-16
updated: 2026-09-16
title: Cloudflare Containers
description: Dockerイメージをそのまま Cloudflare のエッジで動かす製品。
tags: [cloudflare, docker]
---
# Cloudflare Containers

Dockerイメージをそのまま Cloudflare のエッジで動かす製品。Durable Object にコンテナのライフサイクルを紐づけ、Worker からのリクエストをコンテナ内のプロセスへ転送する構造をとる。[[cloudflare-sandboxes]] はこれを基盤に、ターミナル・永続コードインタプリタといった高レベルな抽象化を足した上位プロダクト。

## instance_type

メモリ・vCPU・ディスクはあらかじめ用意された段階（instance_type）から選ぶか、カスタム指定できる。カスタムは最低 1 vCPU が必須なので、1 vCPU未満の小さい構成が欲しい場合は既定の段階を使うしかない。

| instance_type | vCPU | メモリ | ディスク |
| --- | --- | --- | --- |
| lite | 1/16 | 256 MiB | 2 GB |
| basic | 1/4 | 1 GiB | 4 GB |
| standard-1 | 1/2 | 4 GiB | 8 GB |
| standard-2 | 1 | 6 GiB | 12 GB |
| standard-3 | 2 | 8 GiB | 16 GB |
| standard-4 | 4 | 12 GiB | 20 GB |

## 料金

Workers Paid プラン（$5/月）が前提で、そこに使用量課金が乗る。

- メモリ: $0.0000025 / GiB秒
- CPU: $0.000020 / vCPU秒（実際にアクティブだった時間だけ）
- ディスク: $0.00000007 / GB秒

メモリとディスクは「起きている間ずっと」課金される（アイドルでも）。CPUは実際に計算に使った分だけ。月あたり25 GiB時間のメモリ・375 vCPU分・200 GB時間のディスクが無料枠として含まれる。

コンテナは `sleepAfter`（アイドルでスリープするまでの時間）を短くするほど、起きている時間が減ってメモリ・ディスク課金を抑えられる。ただしスリープ後の次のリクエストは再度コールドスタートを踏むので、頻繁にアクセスされる用途では逆にコールドスタートの回数が増えるトレードオフになる。

## コールドスタートが `lite` のリソースで readiness チェックに間に合わない

`lite`（256 MiB / 1/16 vCPU）は定常状態のメモリ消費には足りていても、起動直後（クラスローディング・アプリケーションコンテキストの初期化など、フレームワークの初回起動コスト）に必要なメモリ・CPUには足りないことがある。この場合、アプリが実際にポートを bind する前に Cloudflare 側の readiness チェックがタイムアウトし、次のようなエラーになる。

```
Failed to start container: The container is not listening in the TCP address 10.0.0.1:8080
```

このエラーメッセージ自体は「起動直後の readiness チェックが起動処理と競合する」という症状のクラスを指すもので、原因は複数ありうる（[cloudflare/containers#139](https://github.com/cloudflare/containers/issues/139) は Laravel/FrankenPHP での報告で、JVMやメモリには触れていない）。ただし、コミュニティでは `lite` のメモリ不足が原因で、`basic` に上げることで解消したという報告がある（[Cloudflare Developers Discord のスレッド](https://www.answeroverflow.com/m/1389089635816439909)）。

[[barefootjs]] の Spring Boot（JVM）統合で実際にこれを踏んだ。`lite` では本番デプロイのたびにこのエラーでコンテナが起動せず、`basic` に上げたところ解消した。他の統合（Rust/axum、Go/gin、Ruby/rails など、いずれも `lite` のまま）はどれも問題なく起動しており、JVMのコールドスタートコストの大きさが `basic` への引き上げが必要だった理由と考えられる。

## 運用して分かったこと

コンテナがいつ起きていつ止まるかを握っているところで問題が起きやすい。踏んだものを別ノートにしてある。

- [[cloudflare-containers-durable-object-duration]] — 請求の主役は Durable Object の稼働時間になる。コンテナが起きている間は DO も課金されるため。無料枠を超えた日だけグラフが跳ねて見える理由も。
- [[container-pid1-sigterm]] — アイドル停止は SIGTERM で行われるので、PID 1 がハンドラを持たないイメージは止まらず、15 分ぶん余計に動く。tini を置いて直す。
- [[cloudflare-containers-stuck-running-slot]] — 止まったインスタンスが running 枠を握り続け、500 を返し続けることがある。未解決。

## [[cloudflare-workers]]の中での位置づけ

Workerからコンテナへリクエストを転送する構成そのものはWorkers側の話だが、コンテナ自身のリソース設定・起動特性は独立した関心事としてこちらにまとめる。

## 理解度チェック

```quiz
`lite` インスタンスの256 MiBは、何のためには足りるが何のためには足りないことがあるか。
---
定常状態（steady-state）のメモリ消費には足りていても、起動直後のコールドスタート（クラスローディングやアプリケーションコンテキストの初期化など）に必要な一時的なメモリ・CPUには足りないことがある。
```

```quiz
「Failed to start container: not listening in the TCP address」というエラーは何を意味するか。
---
アプリが実際にポートをbindする前に、Cloudflare側のreadinessチェックがタイムアウトしたことを意味する。起動処理そのものが遅い（JVMのコールドスタートなど）ケースの他にも、症状として同じエラーになる原因は複数ありうる。
```

## 出典

- [cloudflare-docs: containers/platform-details/limits](https://github.com/cloudflare/cloudflare-docs/blob/production/src/content/docs/containers/platform-details/limits.mdx)
- [Cloudflare Containers Pricing](https://developers.cloudflare.com/containers/pricing/index.md)
- [Container not ready on cold start - cloudflare/containers#139](https://github.com/cloudflare/containers/issues/139)
- [Cloudflare Developers Discord: 256 MiBが原因だった報告](https://www.answeroverflow.com/m/1389089635816439909)

#cloudflare #docker
