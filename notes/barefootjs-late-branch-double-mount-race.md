---
created: 2026-09-12
updated: 2026-09-12
title: "BarefootJS: マウント後に現れる分岐の内部条件分岐がDOM更新されないことがある"
description: BarefootJS で、祖先の三項演算子(cond ?
tags: [barefootjs, reactivity, hydration]
---
# BarefootJS: マウント後に現れる分岐の内部条件分岐がDOM更新されないことがある

[[barefootjs]] で、祖先の三項演算子(`cond ? <A/> : <B/>`)がマウント後に`A`から`B`へ切り替わったとき、`B`の中にある子コンポーネントがさらに内部に持つ条件分岐(`{errorMessage ? <div>...</div> : null}`)が、シグナルは正しく変化しているのに一度もDOM更新されないことがある。エラーもワーニングも出ない。

peitho-studioの`StatusBar.tsx`で発生を確認した。`errorMessage`は`null`で始まり、操作が失敗すると文字列がセットされる。`Studio.tsx`側は`deck.deckPath() === null ? <WelcomeScreen/> : (<>...<StatusBar/>...</>)`という構造で、`StatusBar`は最初のマウント時には存在せず、`deckPath`がnullでなくなったあとに初めて生成される。

## 原因: ランタイムを直接計装して特定した

`@barefootjs/client`(0.35.1)の`dist/reactive.js`・`dist/runtime/index.js`に`console.log`を仕込んで再ビルドし、実アプリのPlaywright e2eで実際の挙動を記録して突き止めた。

まず、リアクティビティ自体は壊れていない。`errorMessage`のsignalに`set()`する箇所で購読者数をログすると、動く場合も動かない場合も7〜8件の購読者が付いており、対応する`createEffect`は実際に再実行されていた。壊れているのはその先、DOM更新の段階。

`insert(scope, id, conditionFn, whenTrue, whenFalse)`(コンパイルされた三項演算子が降りる先。`src/runtime/insert.ts`相当)は、`scope`引数をもとに`makeRegion(scope)`で条件分岐の探索範囲(`region.bindScope`)を決める。`StatusBar`がfragmentRootのクライアントコンポーネントとして自身の内部条件分岐に対して`insert()`を呼ぶとき、この`scope`が**自分自身のフラグメント内の後続の兄弟要素**(観測した実例では`<footer>`)に解決されてしまうケースがあった。

`updateFragmentConditional`は`region.anchor`がコメントノードでない場合、`commentsInScope(scope)`/`candidatesInScope(scope, selector)`で`<!--bf-cond-start:sN-->`マーカーや`[bf-c="sN"]`要素を探す。だが探索は`scope`自身のサブツリーに限定されており、マーカーは`scope`(=`<footer>`)より**前の兄弟**にある。見つからないので`startComment`も`condEl`も`null`のまま、更新処理は何もせず終わる。これが毎回無音で起きる。

## 決定的な証拠: 同じコンポーネントの二重初期化

さらにログを比べると、動く場合と動かない場合で決定的な違いが見つかった。

- **動く場合**: `StatusBar`(実験では`StatusBarDebug`という名前で再現)が**2回**初期化されていた。1回目は上記の壊れたスコープ(`<footer>`)、2回目は別の要素をスコープとして解決していて、たまたま正しく動作した。2回目が実質的に1回目を上書きし、結果としてバナーが表示される。
- **動かない場合**: `StatusBar`は**1回だけ**、常に壊れたスコープ(`<footer>`)で初期化される。
- 逆に動かない場合は、代わりに祖先分岐の`true`側(`WelcomeScreen`)の方が2回初期化されていた。つまり「どちらの子が2回初期化されるか」が入れ替わっているだけで、二重初期化自体は両方のケースで起きている。

BarefootJSのCSRランタイムは、グローバルなハイドレーション・ウォーカー(`walkAllInDocumentOrder`、microtask + `requestAnimationFrame`でスケジュールされる)を持っていて、これとは別に、コンパイル済みコードが親の`bindEvents`から明示的に子コンポーネントを初期化する経路もある。この2つの経路が同じ論理的な子インスタンスを競合して初期化してしまい、勝った方(タイミング的に後に実行された方)のスコープ解決だけがたまたま正しくなる、という構造に見える。

「どちらが勝つか」は本来無関係なはずのタイミング変化に敏感だった。祖先の条件を駆動するstoreファクトリ関数(`createSignal`/`createMemo`を使う)を**別モジュールファイルからimportするか、同じファイルにローカル関数として定義するか**を入れ替えるだけで、二重初期化される側がStatusBar⇄WelcomeScreenの間で入れ替わり、症状の再現/非再現が反転した。

## 再現: 最小fixtureへの切り出しには至っていない

上記の「別モジュールからimportされたstoreファクトリが祖先の条件を駆動する」という構成を、素の`create-barefootjs`スキャフォールドで3通り試したが(Honoアダプタ@0.35.5、CSRアダプタ@0.35.5、CSRアダプタを0.35.1に固定)、いずれも問題は再現しなかった。実アプリ(`Studio.tsx`)は数十個のeffect/signalを持つ大きなコンポーネントで、そこから切り出した小さな再現コードでは同じレースが起きない。何が本当に必要条件なのかは特定できていない。

そのため、この内容だけでは新しいissueを立てていない。[piconic-ai/barefootjs#2948](https://github.com/piconic-ai/barefootjs/issues/2948)は、この症状の「確認」だと思っていたものが実は無関係な別のクラッシュ(`TypeError: __scope.getAttribute is not a function`、同一ファイル内の子のhydration周り)だったと分かり、closeされた前科がある。再現できない状態でissueを立てて同じ轍を踏まないようにしている。

## 回避策

祖先の分岐に依存して**マウント自体を切り替える**のをやめ、要素は常時マウントしたまま`hidden`属性で表示だけを切り替える。`insert()`のブランチ切り替え/スコープ解決の経路そのものを通らなくなるので、この種のバグの影響を受けない。peitho-studioの`SlideContextMenu.tsx`/`SlidePreview.tsx`が、全く別の原因(conditional `ref`の中で作った`createEffect`が分岐の再入のたびリークする問題)に対して既に採用していたのと同じ「常時マウント + hidden」パターンで回避できた。

子コンポーネントのhydration/初期化の所有権という意味では[[barefootjs-orphaned-child-hydration]]と隣接するが、あちらは「誰も`initChild`を呼ばない」ために永久にhydrateされない話で、こちらは逆に「2つの経路が両方呼んでしまう」話。軸が逆。

## 理解度チェック

```quiz
`errorMessage`のsignalへの`set()`は正しくエフェクトを再実行しているのに、なぜバナーのDOMは更新されないのか?
---
`insert()`に渡る`scope`が、条件分岐のコメントマーカーを含まない無関係な兄弟要素(観測例では`<footer>`)に解決されてしまうことがある。`updateFragmentConditional`はマーカー探索を`scope`自身のサブツリーに限定しているため見つからず、更新処理が毎回無音でno-opになる。
```

```quiz
動くケースと動かないケースを比べたとき、決定的だった違いは何か?
---
同じ子コンポーネントがグローバルなハイドレーション・ウォーカーと親の明示的なmount呼び出しの両方から二重に初期化されるかどうか。動くケースでは2回初期化され2回目のスコープ解決がたまたま正しく機能した。動かないケースでは1回だけ、常に壊れたスコープで初期化された。
```

```quiz
この種のバグをアプリ側で回避する方法は?
---
条件付きマウント(`cond ? <div/> : null`)をやめ、要素を常時マウントしたまま`hidden`属性で表示だけを切り替える。`insert()`のブランチ切り替え経路自体を通らなくなる。
```

## 出典

- `piconic-ai/peitho-studio`(`components/StatusBar.tsx`・`components/Studio.tsx`、2026-09-12時点)での実地調査。`@barefootjs/client@0.35.1`の`dist/reactive.js`・`dist/runtime/index.js`を一時的に計装して確認した。
- [piconic-ai/barefootjs#2948](https://github.com/piconic-ai/barefootjs/issues/2948)(この症状の確認だと思っていたものが無関係な別バグだったと分かりclose)

#barefootjs #reactivity #hydration
