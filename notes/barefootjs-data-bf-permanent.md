---
created: 2026-08-24
updated: 2026-08-24
---
# data-bf-permanent でナビゲーション間の再描画を防ぐ

[[barefootjs-router-region-contract|@barefootjs/router]] は region の swap（差し替え）のたびに、region 内の要素を丸ごと作り直す。同じ内容の要素（同じ画像など）がページをまたいで存在し続けていても、DOM ノードとしては毎回新しく作られる。`data-bf-permanent` は、新旧ドキュメントで同じ属性値（または `id`）を持つ要素同士を「同一のもの」とみなし、生きた DOM ノードをそのまま次のページへ持ち越す仕組み。

## 仕組み

```html
<img src="/logo.jpg" data-bf-permanent="site-logo-img" />
```

新しいページの HTML にも同じ値の `data-bf-permanent` を持つ要素があれば、古い方の**生きた DOM ノードそのもの**が新しい位置へ移動して使われる（作り直しではない）。state・スクロール位置・ハイドレーション済みスコープも道連れで残る。README が挙げる典型例は動画プレーヤー（再生位置や再生状態を遷移で失いたくない）だが、region の**外**にある要素向けに紹介されている機能で、region の**中**での用途は明記されていない。

## region の中でも効く: ロゴのちらつき対策

サイト共通ヘッダーを [[barefootjs-router-region-contract|region の中に移した]]結果、ページ間で見た目が変わらないロゴ画像まで、遷移のたびに `<img>` が作り直されるようになった。ファイル自体は HTTP キャッシュ済みで再ダウンロードは起きないが、DOM ノードの破棄・再生成そのものが視覚的なちらつきとして見えていた。

`<img>` に `data-bf-permanent="site-logo-img"` を付けるだけで解決した。

```tsx
<img src="/static/img/kobaken.jpg" alt="" data-bf-permanent="site-logo-img" />
```

## 要素の有無が変わる境界での挙動

このサイトはページによってロゴの表示・非表示が切り替わる（トップページだけ非表示）。境界をまたぐ遷移でどうなるか実機で確認した:

- ロゴが**ある**ページ同士（例: `/profile` → `/blog`）: 同じ `data-bf-permanent` 値を持つ `<img>` 同士がマッチし、DOM ノードがそのまま生き残る（`img.dataset` に付けた目印が遷移後も残ることで確認）
- ロゴが**ある**→**ない**（`/profile` → `/`）: 新しいページに一致する要素がないので、古いノードは普通に破棄される
- ロゴが**ない**→**ある**（`/` → `/profile`）: 古いページに生きたノードがないので、新しいノードとして作られる（これは「作り直し」ではなく元々存在しなかったので自然）

`showLogo` のようなページごとに変わる prop で要素の出現・消滅を切り替えるコンポーネントと、`data-bf-permanent` は無理なく共存する——`data-bf-permanent` はマッチする要素があるときだけ保持を行うオプトインの仕組みで、マッチしなければ普通の作り直しにフォールバックするだけだから。

## 出典

- `node_modules/@barefootjs/router/README.md`（`Persistence (data-bf-permanent)` の節）
- kobaken.co での実機検証（`img.dataset` にマーカーを仕込んで遷移前後の同一性を確認）

#barefootjs #router
