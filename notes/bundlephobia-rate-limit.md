---
created: 2026-09-13
updated: 2026-09-13
title: bundlephobia のレート制限
description: npm パッケージのバンドルサイズを調べられるサービス bundlephobia には、 API 呼び出しに対するレート制限がある。
tags: [bundlephobia, shields-io, npm]
---
# bundlephobia のレート制限

npm パッケージのバンドルサイズを調べられるサービス [bundlephobia](https://bundlephobia.com/) には、
API 呼び出しに対するレート制限がある。shields.io のバンドルサイズバッジ
（`https://img.shields.io/bundlephobia/minzip/<package>`）はこの API を経由しているため、
レート制限に達すると本来のサイズの代わりに `rate limited by upstream service` という文字列が
バッジとして表示される。

## 仕組み

shields.io は自前でバンドルサイズを計算しているわけではなく、バッジへのリクエストのたびに
bundlephobia.com の API を呼び出して値を取得している。bundlephobia 側の API がレート制限に
かかると、shields.io はそのエラーをそのままバッジの文字列として描画する。

- リポジトリのコードや README の記述に問題があるわけではない。
- 一時的な現象であることが多く、時間を置いて再読み込みすると解消することがある。
- shields.io 側でキャッシュ期間を延ばす対応が提案されているが、bundlephobia 固有の恒久対応は
  見当たらない。

## 実例

[[barefootjs|BarefootJS]] の README にある `@barefootjs/client` のバンドルサイズバッジで
この表示が確認できた（2026-09-13 時点）。

```html
<img alt="npm bundle size" src="https://img.shields.io/bundlephobia/minzip/@barefootjs/client" />
```

## 他のバッジでも起きる

同じ `rate limited by upstream service` は bundlephobia 以外の shields.io バッジ（PyPI の
ダウンロード数、Read the Docs、Visual Studio Marketplace など）でも報告されている。shields.io が
外部 API を都度呼び出して描画する仕組みそのものに起因する問題で、bundlephobia 固有ではない。

## 理解度チェック

```quiz
バンドルサイズが変わっていないのに、shields.io の bundlephobia バッジが
`rate limited by upstream service` と表示されるようになった。README や
package.json を疑うべきか？
---
疑う必要はない。shields.io がバッジ生成のたびに bundlephobia.com の API を呼んでおり、
その API 側のレート制限にかかっただけの一時的な表示。時間を置けば直ることが多い。
```

## 出典

- [BUNDLEPHOBIA: RATE LIMITED BY UPSTREAM SERVICE (badge example)](https://img.shields.io/bundlephobia/minzip/slidish?style=for-the-badge)
- [Rate limited by upstream service · Issue #11410 · badges/shields](https://github.com/badges/shields/issues/11410)
- [Read the Docs badge shows `rate limited by upstream service` · Issue #11952 · badges/shields](https://github.com/badges/shields/issues/11952)

#bundlephobia #shields-io #npm
