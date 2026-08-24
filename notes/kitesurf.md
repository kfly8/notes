---
created: 2026-08-24
updated: 2026-08-24
---
# Kitesurf

Cloudflare が2026年8月6日(木)、[[cloudflare-agents-week-2026]] で発表した、AI エージェント専用のブラウザ。Chromium を使わず、Cloudflare Workers の V8 アイソレート上に、Rust + WebAssembly で独自実装されている。

## なぜ Chromium を使わないか

Chromium は人間向けに作られており、エージェントには不要な機能(タブ、拡張機能、60fps 描画など)のためにリソースを消費する。記事は「AI doesn't care about tabs, themes, browser extensions」とし、代わりにエージェントが必要とするもの(トークン数、コンテキストウィンドウ、スケーラビリティ、コスト)への最適化を優先したとしている。

設計方針:

- 可能な限り Rust を使う。Emscripten 層を避けて効率を追求する
- 各ページの読み込みは信頼できない入力(untrusted input)として扱い、Dynamic Workers でコンポーネントを分離する
- ステートレスにできる箇所は極力ステートレスにし、スケーラビリティと障害復旧を両立する

## パフォーマンス比較(14 URL のテストコーパス)

| 項目 | Kitesurf | Chromium(ウォームプール) | 差 |
| --- | --- | --- | --- |
| CPU(スクリーンショット) | 380ms | 1,173ms | 3.1倍少ない |
| CPU(HTML抽出) | 229ms | 877ms | 3.8倍少ない |
| メモリ(スクリーンショット) | 57.8MiB | 271.0MiB | 4.7倍少ない |
| メモリ(HTML抽出) | 39.4MiB | 273.7MiB | 7.0倍少ない |
| 実行時間(スクリーンショット) | 1,148ms | 637ms | 1.8倍遅い |
| 実行時間(HTML抽出) | 820ms | 472ms | 1.7倍遅い |

CPU・メモリでは大幅に上回るが、実行時間そのものは Chromium の方が速い。記事はメモリ・CPU の削減が課金額("your bill")を大きく改善すると位置づけている。

## 対応エコシステムと制約

CDP (Chrome DevTools Protocol) 互換なので Puppeteer・Playwright・chrome-remote-interface がそのまま動く。MCP (Model Context Protocol) 経由の利用にも対応する。既存の Browser Run (Cloudflare のブラウザ自動化サービス) の CDP エンドポイントに `browser=kitesurf` を付けるか、公開プレイグラウンド (`https://kitesurf.cloudflare.app/`) から試せる。

未対応の機能:

- 動画再生
- WebGL レンダリング
- TLS フィンガープリントを使うボット検証の突破
- 10分を超える認証済みセッション状態の保持

ピクセル完全な描画や滑らかな 60fps スクロールは意図的に目標にしていない。CSS のパース誤差やレンダリングの不正確さは許容し、非互換なサイトでは Chromium 版を使うよう案内している。

発表時点ではベータ版として Browser Run 内で無料提供中。将来的なオープンソース化も予告されている。

## [[cloudflare-agents-week-2026]]の中での位置づけ

エージェント側からWebを見に行く手段(ブラウザ)を扱う。サイト側からエージェントを迎え入れる仕組みは [[webmcp]] に分けた。

## 理解度チェック

```quiz
Kitesurf は実行速度(wall time)でも Chromium より優れているか。
---
いいえ。CPU とメモリでは大幅に上回る(3〜7倍少ない)が、実行時間そのものは Chromium の方が1.7〜1.8倍速い。
```

```quiz
Kitesurf が意図的にピクセル完全な描画を目指していないのはなぜか。
---
エージェントはタブや拡張機能、60fpsの滑らかな描画を必要としない。代わりにトークン数・コンテキストウィンドウ・スケーラビリティ・コストの最適化を優先する設計方針のため。
```

## 出典

- [Introducing Kitesurf: The agent-first browser that runs in V8 isolates on Cloudflare Workers](https://blog.cloudflare.com/kitesurf/)
- [Everything we launched during Agents Week](https://blog.cloudflare.com/agents-week-review-august-2026/)

#cloudflare #agents-week-2026 #ai-agent #browser
