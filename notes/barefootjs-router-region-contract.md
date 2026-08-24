---
created: 2026-08-22
updated: 2026-08-24
---
# BarefootJS Router の region 契約

[[barefootjs]] の `@barefootjs/router` は部分ナビゲーション（`[bf-region]` だけを差し替える遷移）の際、**region の外にあるものには一切触らない**。README 冒頭に明記されている一次の契約:

> swaps only the page **region**, and disposes/re-hydrates just the islands inside it. **The shell stays mounted; everything outside the region keeps its DOM, scroll, and state.**

つまり region の外は「更新されない」のではなく「更新する仕組みがそもそもない」。ここを知らずに、ページごとに変わる値を region の外に置くと、値は遷移前のまま固まる。実際に2種類のハマり方をした: `<head>` に置いた route-scoped なリソース（節「head: メタデータとリソース」）と、`<body>` の region 外に置いたコンポーネントの props（節「body: region の外は state を保持したまま」）。

## head: メタデータとリソースは別扱い

`<head>` はさらに「メタデータ」と「リソース」の2種類に分かれる。

### メタデータは常に reconcile される

`<title>`、`<meta name="description|keywords|robots|author|theme-color">`、`og:*`/`twitter:*`、`<link rel="canonical|alternate|prev|next">` は、遷移のたびに新しいページの内容と突き合わせて同期される。無効化するフラグはない。両方に同じキーがあれば置き換え（内容が同じなら DOM に触らない）、新ページにしかないキーは追加、旧ページにしかないキーは**削除**される。この allowlist に載っていない要素（analytics タグ、CSP の `meta http-equiv`、`preconnect` など）は一切触られない。Turbo のように「追跡されていない head 要素を全部消す」方式ではない。

### リソースは一切触られない

`<link rel="stylesheet">`、`<script>`、`<style>` は往復どちらの方向にも触られない。理由は「そのリソースがまだ必要かどうかは、遷移先のドキュメントだけを見ても判断できない」から。`[data-bf-permanent]` なノードやポータル、region の外で生き続けるアイランドが、次のページの head には載っていないシートに依存し続けているかもしれない。

これが唯一の罠を作る。**route ごとに内容が変わる `<style>` を `<head>` に置くと**:

- そのルートに遷移で**入る**とき: まだ古いページの `<style>` のままなので、無スタイルで表示される（リロードすれば直るので、原因調査がキャッシュやビルドの方に向いてしまう）
- そのルートから遷移で**出る**とき: `<style>` は消えずに残り、以降のすべてのルートにそのルールが効き続ける

### 正しい対処: リソースは Region の中に置く

公式の推奨は、route-scoped なリソースを `<head>` ではなく `<Region>` の**中**に置くこと。`rel="stylesheet"` は body 内でも有効な HTML なので、これは正当な書き方になる。

```tsx
<Region>
  {isEditor ? <link rel="stylesheet" href="/editor.css" /> : null}
  {children}
</Region>
```

region の中身と一緒に挿入・削除されるので、両方向の順序が構造的に正しくなる（ナビゲーションのブロッキング待ちも発生しない）。逆に、本当にグローバルなシートは `<head>` に置いたままでよい——それこそが「絶対に触らない」の意味するところ。

### kobaken.co で実際に踏んだ経緯（1回目）

`hono/css` の `<Style/>` は、そのリクエストで実際にコンパイルされた `css()` 呼び出しの集合をレンダーごとに `<head>` に出力する。ページによって中身（クラス名のハッシュ）が変わるので、これはまさに「route-scoped stylesheet」そのもの。Router 適用範囲を広げるたびにこの罠を踏み、2回目でようやく契約自体を読みに行った。

最終的な対処は「`<Region>` の中に置く」ではなく、そもそも `hono/css` をやめて UnoCSS 1枚の静的ファイル（全ページ共通の `<link>`、内容はビルド時に固定）に置き換えることだった。ページ間で内容が変わらない `<link rel="stylesheet">` は、この契約のもとで最初から何の問題も起きない。

## body: region の外は state を保持したまま

head 以外にも同じ契約が及ぶ。`<body>` 内でも region の外にあるコンポーネントは、遷移のたびに作り直されるのではなく、DOM ごとそのまま生き続ける——props を含めて。region の外に置いたコンポーネントに、ページごとに変わる prop を渡しても、その prop は**次の遷移では更新されない**。

### kobaken.co で実際に踏んだ経緯（2回目）

サイト共通の `Header` を、各ページの `<Region>` の外（renderer 側の `<body>` 直下）に置き、ホームページだけロゴを隠す `showLogo` prop を渡していた。

```tsx
// renderer.tsx の <body> — Region の外
<body>
  <Header showLogo={!isHome} />
  {children}
</body>
```

SSR 直後は `isHome` に応じて正しく出し分けられる。しかし `/profile`（`showLogo=true`）から `/`（`showLogo=false` になるはず）へ Router 経由で遷移すると、`Header` は region の外にあるため作り直されず、ロゴは**前のページの状態のまま**残った。逆方向でも同様——ロゴの有無が「今のページ」ではなく「直前にクリックした瞬間」を反映してしまう。

対処は、`Header` を region の中（`Layout` コンポーネント内、`<Region>` の直下）に移すこと。ページごとに変わる prop を持つものは、region の外に置いた時点でこの契約に引っかかる。

```tsx
// Layout.tsx — Region の中
'use client'
import { Region } from '@barefootjs/client'
import { Header } from './Header'

export function Layout(props: { children?: unknown; className?: string; showLogo?: boolean }) {
  return (
    <Region>
      <Header showLogo={props.showLogo} />
      <main className={...}>{props.children}</main>
    </Region>
  )
}
```

サーバーコンポーネントをクライアントコンポーネントから import すると BF003（"use client" ファイルは "use client" でないファイルを import できない）になるので、移した先で `Header` と、その中で使う `ToggleTheme` にも `'use client'` を足す必要があった。

## 余談: 遷移後にフォーカスも動く

region の中身が差し替わったあと、ルーターは新しい region の最初の見出しへ `tabindex="-1"` + `focus({ preventScroll: true })` でフォーカスを移す（スクリーンリーダーへのページ変化の告知が目的）。これはプログラムによる focus で、キーボード操作ではないため `:focus-visible` にはマッチしない。サイト側が `:focus` にだけ outline を当てていると、遷移のたびに触ってもいない見出しに枠が付いて見える——詳細と対処は [[programmatic-focus-and-focus-visible]]。

## 出典

- `node_modules/@barefootjs/router/README.md`（冒頭の概要と `## <head>: metadata is reconciled, resources are not` の節）

#barefootjs #router #hono #css
