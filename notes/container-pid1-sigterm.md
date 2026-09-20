---
created: 2026-09-20
updated: 2026-09-20
title: コンテナの PID 1 がハンドラを持たないと SIGTERM は無視される
description: Linux はコンテナ内の PID 1 を init として特別扱いし、ハンドラを登録していないシグナルを PID 1 に届けない。
tags: [linux, docker, containers, cloudflare, signals]
---
# コンテナの PID 1 がハンドラを持たないと SIGTERM は無視される

Linux はコンテナ内の PID 1 を init として特別扱いし、**ハンドラを登録していないシグナルを PID 1 に届けない**。既定動作（SIGTERM なら終了）が適用されないので、自前でシグナルを扱わないプロセスを `CMD` で直接起動していると、停止要求を投げても無視されて動き続ける。ゾンビプロセスの回収も PID 1 の役目で、これも自前でやらないプロセスでは行われない。

ローカルの Docker には `docker run --init`（compose なら `init: true`）があって tini を PID 1 に差し込んでくれるが、**Cloudflare Containers の `[[containers]]` 設定には相当する項目がない**（wrangler 4.90 時点で `name` / `image` / `instance_type` / `max_instances` / `rollout_*` などのみ）。イメージ側で用意するしかない。

## Cloudflare Containers では 15 分ぶん余計に動く

`@cloudflare/containers` の `Container` クラスは、`sleepAfter` のアイドル時間を過ぎると `container.signal(15)`、つまり SIGTERM を送るだけ。プラットフォーム側の停止手順は「SIGTERM を送る → 最大 15 分待つ → SIGKILL」なので、SIGTERM を無視するイメージは **1 回起こされるたびに `sleepAfter` + 約 15 分**動き続ける。`sleepAfter = '1m'` なら約 16 倍。

コンテナが起きている間は Durable Object も課金されるので、費用はそのまま二重に効く → [[cloudflare-containers-durable-object-duration]]。

## 自前で扱うランタイム、扱わないランタイム

16 個のイメージを本番で測った結果。`sleepAfter`（1〜2 分）を過ぎた 4 分後にアクセスし、応答が速ければ「まだ起きている＝SIGTERM を無視した」と判定した（キャッシュを避けるためクエリ文字列を毎回変える）。

| 無視した（PID 1 のまま放置されていた） | 自前でハンドラを持つ |
|---|---|
| 素の Rust バイナリ（axum）、Werkzeug（flask）、Django の `runserver --noreload`、`sh -c "php -S"`（php / blade）、`php artisan serve`（laravel） | Go ランタイム、uvicorn（fastapi）、Puma（rails / sinatra）、Starman（xslate）、Mojolicious、JVM（spring） |

Go のランタイムは起動時に自分でハンドラを入れるので PID 1 でも終了する。Python は SIGINT しか登録しないため、uvicorn のように明示的に扱うものを除いて無視する。Django は autoreload 側に `signal.signal(SIGTERM, ...)` があるので、`--noreload` を付けた本番構成ではハンドラが無い。`sh -c` を挟む PHP は、dash が `exec` してもしなくても結局ハンドラ無しのプロセスが PID 1 になる。

## 測り方

本番では応答時間で判定できる。ローカルなら `docker stop -t 20` の所要時間と終了コードのほうが確実。

```
docker stop -t 20 <container>
# 0.1〜0.6 秒で終わり exit 143 → SIGTERM で正常終了
# 20 秒かかって exit 137  → 無視されてタイムアウト後に SIGKILL
```

同じイメージで ENTRYPOINT を外して比べると、PID 1 の違いだけを切り離せる。

```
docker run --entrypoint '' <image> <元の CMD>
```

## tini を PID 1 に置く

```dockerfile
RUN apk add --no-cache tini          # Debian 系は apt-get install -y tini
ENTRYPOINT ["tini", "-g", "--"]
CMD ["...", "..."]
```

- サーバーは tini の子になるので、ハンドラが無くても SIGTERM の既定動作（終了）が適用される。
- 自前でハンドラを持つランタイム（JVM、Puma、Starman、uvicorn、Go）にも害はない。tini が中継するので、これまでどおり graceful shutdown する。
- `-g` はプロセスグループ全体にシグナルを送る。`php artisan serve` が `php -S` を起動するような、子プロセスが本体の構成にも届く。
- ゾンビ回収も tini が引き受ける。
- 「今必要なイメージだけ」ではなく全イメージに入れておくと、「このランタイムは PID 1 で安全か」を毎回判断しなくて済む。

`ENTRYPOINT` を上書きすると、ベースイメージ側の ENTRYPOINT は消える。`php:8.4-cli` の `docker-php-entrypoint`（第 1 引数が `-` 始まりのときだけ `php` を前置する）や `eclipse-temurin` の `/__cacert_entrypoint.sh`（`USE_SYSTEM_CA_CERTS` が設定されたときだけ働く）は、これらを使っていなければ消えても影響しない。

## シェルを挟まない

```dockerfile
# 避ける: sh が常駐して、シグナルの経路にプロセスが 1 つ増える
CMD ["sh", "-c", "PHP_CLI_SERVER_WORKERS=8 php -S 0.0.0.0:${PORT} index.php"]

# 環境変数は ENV、ポートは直接書く
ENV PHP_CLI_SERVER_WORKERS=8
CMD ["php", "-S", "0.0.0.0:8080", "index.php"]
```

実際に `sh -c` 版のプロセスを覗くと、dash は `exec` せずに残っていた。exec 形式にすればサーバーが tini の直下に来る。

## [[cloudflare-containers|Cloudflare Containers]]の中での位置づけ

アイドル停止が効かなくなる原因のうち、イメージ側で直せるもの。直しても残る不整合は [[cloudflare-containers-stuck-running-slot]]。

## 理解度チェック

```quiz
Python の Web サーバーを `CMD ["python3", "app.py"]` で起動しているコンテナに SIGTERM を送っても終了しない。なぜか。
---
そのプロセスが PID 1 で、Python は SIGTERM のハンドラを登録しないから。Linux は PID 1 に対してハンドラ未登録のシグナルを届けないので、既定動作の「終了」が適用されない。
```

```quiz
tini を入れると、JVM や Puma のように自分で SIGTERM を扱うランタイムの graceful shutdown は壊れるか。
---
壊れない。tini は受け取ったシグナルを子へ中継するだけなので、これまでどおり自前のハンドラが動く。
```

## 出典

- [Containers — Architecture](https://developers.cloudflare.com/containers/platform-details/architecture/)
- [krallin/tini](https://github.com/krallin/tini)

#linux #docker #containers #cloudflare #signals
