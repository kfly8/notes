---
created: 2026-08-22
updated: 2026-08-22
---
# BarefootJS Router の head 契約

[[barefootjs]] の `@barefootjs/router` は部分ナビゲーション（`[bf-region]` だけを差し替える遷移）の際、`<head>` を「メタデータ」と「リソース」に分けて扱う。この境界を知らずに route-scoped な `<style>` を `<head>` に置くと、遷移のたびにスタイルが欠落したり残留したりするバグを踏む。

## メタデータは常に reconcile される

`<title>`、`<meta name="description|keywords|robots|author|theme-color">`、`og:*`/`twitter:*`、`<link rel="canonical|alternate|prev|next">` は、遷移のたびに新しいページの内容と突き合わせて同期される。無効化するフラグはない。両方に同じキーがあれば置き換え（内容が同じなら DOM に触らない）、新ページにしかないキーは追加、旧ページにしかないキーは**削除**される。この allowlist に載っていない要素（analytics タグ、CSP の `meta http-equiv`、`preconnect` など）は一切触られない。Turbo のように「追跡されていない head 要素を全部消す」方式ではない。

## リソースは一切触られない

`<link rel="stylesheet">`、`<script>`、`<style>` は往復どちらの方向にも触られない。理由は「そのリソースがまだ必要かどうかは、遷移先のドキュメントだけを見ても判断できない」から。`[data-bf-permanent]` なノードやポータル、region の外で生き続けるアイランドが、次のページの head には載っていないシートに依存し続けているかもしれない。

これが唯一の罠を作る。**route ごとに内容が変わる `<style>` を `<head>` に置くと**:

- そのルートに遷移で**入る**とき: まだ古いページの `<style>` のままなので、無スタイルで表示される（リロードすれば直るので、原因調査がキャッシュやビルドの方に向いてしまう）
- そのルートから遷移で**出る**とき: `<style>` は消えずに残り、以降のすべてのルートにそのルールが効き続ける

## 正しい対処: リソースは Region の中に置く

公式の推奨は、route-scoped なリソースを `<head>` ではなく `<Region>` の**中**に置くこと。`rel="stylesheet"` は body 内でも有効な HTML なので、これは正当な書き方になる。

```tsx
<Region>
  {isEditor ? <link rel="stylesheet" href="/editor.css" /> : null}
  {children}
</Region>
```

region の中身と一緒に挿入・削除されるので、両方向の順序が構造的に正しくなる（ナビゲーションのブロッキング待ちも発生しない）。逆に、本当にグローバルなシートは `<head>` に置いたままでよい——それこそが「絶対に触らない」の意味するところ。

## kobaken.co で実際に踏んだ経緯

`hono/css` の `<Style/>` は、そのリクエストで実際にコンパイルされた `css()` 呼び出しの集合をレンダーごとに `<head>` に出力する。ページによって中身（クラス名のハッシュ）が変わるので、これはまさに「route-scoped stylesheet」そのもの。Router 適用範囲を広げるたびにこの罠を踏み、2回目でようやく契約自体を読みに行った。

最終的な対処は「`<Region>` の中に置く」ではなく、そもそも `hono/css` をやめて UnoCSS 1枚の静的ファイル（全ページ共通の `<link>`、内容はビルド時に固定）に置き換えることだった。ページ間で内容が変わらない `<link rel="stylesheet">` は、この契約のもとで最初から何の問題も起きない。

## 出典

- `node_modules/@barefootjs/router/README.md`（`## <head>: metadata is reconciled, resources are not` の節）

#barefootjs #router #hono #css
