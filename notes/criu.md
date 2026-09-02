---
created: 2026-08-29
updated: 2026-09-02
title: CRIU
description: 動いているLinuxプロセスの状態(メモリ・ファイルディスクリプタ・ネットワーク接続など)をまるごとダンプし、あとから復元できる技術
tags: [linux, docker, container]
---
# CRIU

Checkpoint/Restore In Userspace の略。動いているLinuxプロセスの状態を丸ごとディスクにダンプし、あとから同じ状態に復元できる。ダンプの対象はメモリ内容・オープンしているファイルディスクリプタ・ネットワーク接続など、プロセスの実行状態そのもの。

## Dockerとの連携

`docker checkpoint create [OPTIONS] CONTAINER CHECKPOINT` でチェックポイントを作り、`docker start --checkpoint <name>` で復元する。Docker 1.13以降に存在するが、**2026年8月時点でも `docs.docker.com` 上でexperimental機能のまま**。使うには daemon.json に `"experimental": true` を設定する必要がある。

- `--checkpoint-dir` で保存先ディレクトリを指定でき、外部に吐き出したチェックポイントを別のコンテナ起動に使い回せる
- TCP接続を維持したコンテナのチェックポイントには `--tcp-established` が必要
- 対話用のTTYは(Docker側では)未対応
- OverlayFSまわりのカーネルバグがあり、`criu.org` はカーネル v4.2-rc2 以降を挙げている

## ビルドキャッシュとは別物

CRIUがキャッシュするのは「ビルド成果物」ではなく「**すでに起動して初期化まで終わったプロセスのランタイム状態**」。Dockerのビルドキャッシュ(レイヤーキャッシュ、BuildKitのキャッシュマウントなど)は `docker build` の各ステップを飛ばす仕組みで、対象はビルド時。CRIUはその先、コンテナを実際に起動して重い初期化処理(モデルロード、JITウォームアップなど)が終わった直後の状態をスナップショットし、次回はそこから即座に再開する。起動の遅さをキャッシュで消す、という意味では感覚的に近いが、対象がビルド時か実行時かが違う。

## 実例: LLM推論サーバーの起動時間短縮

CRIUと `cuda-checkpoint` を組み合わせ、GPU上で動くLLM推論サーバー(SGLang)の起動時間を **12分→10秒** に短縮した報告がある(Fergus Finn, 2026)。モデルの重みとKVキャッシュをチェックポイントから外すことで、サイズを192GBから6.6GBまで削っている。

## 理解度チェック

```quiz
CRIUがキャッシュするのは「ビルド成果物」か「実行時の状態」か。
---
実行時の状態。すでに起動して初期化まで終わったプロセスのメモリ・ファイルディスクリプタ・ネットワーク接続などをダンプする。Dockerのビルドキャッシュ(レイヤーキャッシュ等)とは別の仕組み。
```

```quiz
`docker checkpoint` を使うには何を設定する必要があるか。2026年時点でのステータスは。
---
daemon.json に `"experimental": true` を設定する必要がある。Docker 1.13以降に存在するが、2026年8月時点でもDocker公式ドキュメント上でexperimental機能のまま。
```

```quiz
SGLangの起動時間短縮事例で、チェックポイントのサイズを192GBから6.6GBまで削れたのはなぜか。
---
モデルの重みとKVキャッシュをチェックポイントから外したから。
```

## 出典

- [Docker - CRIU](https://criu.org/Docker)
- [docker checkpoint | Docker Docs](https://docs.docker.com/reference/cli/docker/checkpoint/)
- [Cloudburst: 70x faster cold(ish) starts for SGLang](https://fergusfinn.com/blog/fast-sglang-starts/)

#linux #docker #container
