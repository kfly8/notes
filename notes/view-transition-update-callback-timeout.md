---
created: 2026-08-30
updated: 2026-08-30
---
# View TransitionのupdateCallbackは重い処理を待つとタイムアウトで無言スキップされる

`document.startViewTransition(updateCallback)` の `updateCallback` が一定時間内に確定(resolve/reject)しないと、Chromiumはtransition自体を中断する。コンソールには `Uncaught (in promise) TimeoutError: Transition was aborted because of timeout in DOM update` とだけ出て、**ページの更新自体は普通に完了する**。結果として「エラーは出ているのに、見た目はただの瞬間切り替え(アニメーションなし)」という分かりにくい症状になる。

## 踏んだ経緯

[[barefootjs-router-region-contract]] の `@barefootjs/router` はSPA的な部分ナビゲーションを行うが、遷移の開始〜終了を示す公開された印は `NAVIGATING_ATTR`(`data-bf-navigating`属性、`<html>`に付く)だけで、「DOMの差し替えが終わった瞬間」を示す個別のフックはない。

### 1回目: ナビゲーション全体を待って失敗

最初、`updateCallback` をこの属性が消えるまで待つPromiseにした。

```ts
document.startViewTransition(() => new Promise<void>((resolve) => {
  // NAVIGATING_ATTR が外れたら resolve
}))
```

しかしこの属性は「fetch → DOM差し替え → 破棄済みislandのdispose → 新規モジュールの動的import → 再ハイドレーション」という**ナビゲーション全体**が終わるまで残り続ける。view transitionが本当に必要としているのは「見た目が新しくなった瞬間」だけなのに、無関係な後処理(特に動的importや再ハイドレーション)まで律儀に待ってしまい、タイムアウトを踏んだ。

### 2回目: DOM差し替えだけを待つよう直したのに、まだ失敗した

`updateCallback` を「差し替え対象の要素(`[bf-region]`)の`childList`が変化した瞬間」でresolveするように変更した。差し替えは通常、後処理(dispose・動的import・再ハイドレーション)より前に起きるので、待ち時間は大幅に縮むはず — だったが、特定のページへの遷移で同じタイムアウトが再発した。

原因は `MutationObserver` を `updateCallback` の**中**でセットしていたこと。`startViewTransition()` は呼び出した瞬間に `updateCallback` を実行するとは限らない。Chromiumは先に「差し替え前の状態」のスクリーンショットを撮ってから callback を呼ぶため、そこに数ミリ秒〜1フレーム程度のギャップがある。一方、ナビゲーションが**事前にプリフェッチ済み**(hoverで先読みされていた、など)だと、実際のDOM差し替えはこのギャップより速く終わることがある。`updateCallback` の中で監視を始めた時点では、差し替えはすでに過ぎ去っていて検知できない — 結局ナビゲーション全体待ちのフォールバックに落ち、タイムアウトを再現した。

### 3回目: 監視は`startViewTransition()`を呼ぶ前に仕掛ける

`MutationObserver` を、`NAVIGATING_ATTR` が立った**その瞬間**(`startViewTransition()` を呼ぶより前)にセットするよう直した。resolve関数への参照を外側の変数で保持しておき、`updateCallback` はすでに進行中(あるいはすでに解決済み)のPromiseをそのまま返すだけにする。

```ts
let resolveSwap: (() => void) | null = null
let swapSettled: Promise<void> | null = null

// NAVIGATING_ATTR が立った時点(startViewTransitionを呼ぶ前)
swapSettled = new Promise((resolve) => { resolveSwap = resolve })
const swapObserver = new MutationObserver(() => {
  swapObserver.disconnect()
  resolveSwap?.()
})
regions.forEach((region) => swapObserver.observe(region, { childList: true }))

document.startViewTransition(() => swapSettled)
```

これで差し替えのタイミングに関わらず取りこぼさない。プリフェッチ済みリンクをクリックしてすぐ差し替わるケースを含めて再現テストし、タイムアウトが出なくなったことを確認した。

## 余談: 動いても採用するとは限らない

一覧のタイトルと記事見出しに同じ`view-transition-name`を与えて拡大しながらcrossfadeする「shared element」風の演出も、上の修正と組み合わせて技術的には正しく動かせた(コマ送りのスクリーンショットで拡大・移動を確認済み)。しかし実際に触った上での判断は「一瞬ちらつくだけでダサく見える」だった。位置・サイズの変化が大きい拡大モーフは、控えめなデザインのページでは動きそのものが浮いて見えやすい。技術的に動くことと、そのサイトに合うことは別の話。最終的にこの演出自体を撤回した。

## 理解度チェック

```quiz
document.startViewTransition() のupdateCallbackが遅いと何が起きるか。
---
Chromiumがtransitionを中断し、コンソールに `TimeoutError: Transition was aborted because of timeout in DOM update` を出す。ページの更新自体は普通に完了するが、view transitionのアニメーションは行われず瞬間切り替えになる。
```

```quiz
updateCallbackの中でDOMの変化を監視するMutationObserverを組むと、なぜ取りこぼすことがあるか。
---
startViewTransition()はcallbackを呼ぶ前に「差し替え前の状態」のキャプチャを行うため、呼び出しからcallback実行までにギャップがある。プリフェッチ済みなどで差し替えがそのギャップより先に終わると、callbackの中で監視を始めた時点ではすでに変化が過ぎ去っており検知できない。監視はcallbackの外、startViewTransition()を呼ぶ前に仕掛ける必要がある。
```

## 出典

- 手元で `@barefootjs/router` 経由のナビゲーションに `document.startViewTransition` を組み込み、実際に `TimeoutError` を2段階で踏んで修正・再現テストして確認(2026-08-30)

#view-transitions #barefootjs #router #javascript
