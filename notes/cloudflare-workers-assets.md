---
created: 2026-08-17
updated: 2026-08-30
---
# Cloudflare Workers の静的アセット配信

Cloudflare Workers の静的ファイル配信の仕組み。`wrangler.jsonc` の `assets.directory` を指すだけで、アップロード・配信・キャッシュまで面倒を見てくれる。`main`（Worker のエントリポイント）は必須ではなく、書かなければ Worker を経由せずこの assets 機能だけでリクエストが完結する。ただし既定で付くヘッダーには癖があり、`_headers` で上書きすることになる。

```jsonc
{
  "assets": {
    "directory": "./dist/client",
    "not_found_handling": "404-page"
  }
}
```

Worker と組み合わせる場合は `main` を足し、Worker 側からアセットにアクセスしたいときだけ `assets.binding` も足す。

## 既定で付くヘッダー

- `Content-Type` — アップロード時に wrangler がファイルの拡張子から MIME タイプを判定して付ける
- `Cache-Control: public, max-age=0, must-revalidate` — キャッシュはするが毎回再検証する。古いものが出ない代わりに毎回問い合わせが飛ぶ
- `ETag` — ファイルのハッシュ。上の再検証と組み合わせて、変わっていなければ本文を再送しない
- `CF-Cache-Status` — `HIT` / `MISS`。ただし公式ドキュメントいわく「確率的な結果」で、偽陽性・偽陰性がありうる

## Content-Type に charset が付かない

拡張子から MIME タイプは決まるが、**charset は付かない**。

```console
$ curl -sI https://notes.kobaken.co/agent-koans.md | grep -i content-type
content-type: text/markdown
```

HTML なら `<meta charset="utf-8">` があるのでブラウザが判定できるが、Markdown やプレーンテキストにその手段はない。結果、ブラウザは既定のエンコーディングで解釈し、UTF-8 の日本語が化ける。ファイル自体は正しい UTF-8 なので、`curl | od -c` で中身を見ると正常に読めてしまい、原因の特定が一手遅れる。

XML と JSON は影響を受けない。XML は宣言に `encoding="utf-8"` を書けるし、JSON は仕様上 UTF-8 が既定だから。

## `_headers` で上書きする

アセットのディレクトリに拡張子なしの `_headers` を置くと、そこに書いたルールが既定のヘッダーを上書きする。このファイル自体は配信されない。

```txt
/*.md
  Content-Type: text/markdown; charset=utf-8
```

URL パターンには `*` が使える。複数のルールにマッチしたリクエストは、すべてのルールのヘッダーを受け取る。同じヘッダーが二度当たった場合はカンマで連結される。上限はルール100件、1行2000文字。

**`_headers` は Worker が生成したレスポンスには適用されない。** 静的アセットとして返るものにだけ効く。SSR しているルートや `run_worker_first` を設定している場合は、Worker のコード側でヘッダーを付ける必要がある。

## 拡張子なし URL の解決

`html_handling` の既定は `auto-trailing-slash`。`.html` を意識せずに URL を組める。

```console
$ curl -s -o /dev/null -w '%{http_code}' https://notes.kobaken.co/agent-koans
200
$ curl -s -o /dev/null -w '%{http_code}' https://notes.kobaken.co/agent-koans.html
307
```

`.html` 付きでアクセスすると拡張子なしへリダイレクトされる。**この挙動は「そのファイルが存在するか」の判定にも使える**。デプロイしたはずのページが 404 なら、`.html` 付きで叩いてみて 307 が返らない時点で、アセットとしてアップロードされていないと分かる。

## Worker のリダイレクト処理と重複しがち

`auto-trailing-slash` は assets 層で完結するので、Worker 側で同じ正規化をもう一度書くと処理が二重になる。実例として、notes.kobaken.co はもともと [[astro-hono-adapter|Astro の Hono アダプタ]]経由で `main: "@astrojs/cloudflare/entrypoints/server"` を Worker として立てていたが、全ページ prerender のため Hono パイプラインで意味を持っていたのは `trailingSlash()` ミドルウェアだけだった。それがこの `auto-trailing-slash` と同じ仕事をしていたため、`wrangler dev` で `.html` の 307・末尾スラッシュの 307・`.md` の Content-Type・404・通常ページがすべて変更前と同じ挙動であることを確認した上で `main` / `assets.binding` / `observability` を外し、Worker なしの構成に変更した。

## `.assetsignore`

アセットのディレクトリに置くと、そこに書いたファイルはアップロードから除外される。書式は gitignore と同じ。

`@astrojs/cloudflare` はビルド時に解決済みの `wrangler.json` を出力ディレクトリに書き出すが、同時に `.assetsignore` に自分で登録して、設定ファイルが公開されないようにしている。

## [[cloudflare-workers]]の中での位置づけ

静的ファイルの配信を扱う。Worker自身が生成したレスポンスのキャッシュは別の仕組みで、[[cloudflare-workers-cache]] に分けた。

## 理解度チェック

```quiz
`.md` を配信すると日本語が化けるのに、`.html` では化けないのはなぜか。
---
どちらも Content-Type に charset が付かないが、HTML は `<meta charset>` でブラウザが判定できる。Markdown にはその手段がないため、既定のエンコーディングで解釈される。
```

```quiz
デプロイしたはずのページが 404 になる。`.html` を付けて叩くと何が分かるか。
---
アセットとして上がっていれば拡張子なしへ 307 でリダイレクトされる。307 が返らなければ、そのファイルはアップロードされていない。
```

```quiz
全ページ prerender の静的サイトで、Worker（`main`）の `trailingSlash()` ミドルウェアを外しても挙動が変わらないと判断できたのはなぜか。
---
`html_handling` の既定 `auto-trailing-slash` が、拡張子なし URL への正規化という同じ処理を assets 層ですでに担っていたため。
```

## 出典

- [Headers - Workers static assets](https://developers.cloudflare.com/workers/static-assets/headers/)
- [Static Assets - Cloudflare Workers](https://developers.cloudflare.com/workers/static-assets/)

#cloudflare #workers #http
