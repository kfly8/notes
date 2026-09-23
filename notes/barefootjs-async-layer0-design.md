---
created: 2026-09-21
updated: 2026-09-23
title: BarefootJS の非同期 API は createQuery / createMutation と http の記述に落ち着いた
description: BarefootJS の非同期データ層（spec/async.md の層 0）の設計。
tags: [barefootjs, async, signals, api-design]
---
# BarefootJS の非同期 API は createQuery / createMutation と http の記述に落ち着いた

[[barefootjs]] の非同期データ層（`spec/async.md` の層 0）の設計。Solid 2.0 が `createResource` を捨てて memo に非同期を載せた（[[async-state-as-value-vs-graph-node]]）のを受けて、同じ道を取れるかから検討を始め、2026-09-21 に次の形で spec を書き直した。

```tsx
import { createQuery, createMutation, http } from '@barefootjs/client'

// query。依存が変われば自動で取り直す。initial はサーバーが描いた取得済みの結果
const [posts, fetchPosts] = createQuery(
  () => http.get('/api/posts', { page: page() }),   // 再評価される関数。読んだ signal が依存
  { initial: props.posts, ttl: 15_000 },
)
posts()                  // T | undefined。initial が必須 prop なら T
fetchPosts()             // 取り直す。Promise<T>
fetchPosts.isPending()   // 最後の送信が未決着
fetchPosts.error()       // 最後の送信が失敗

// mutation。action を呼んだときだけ送る
const [saved, saveComment] = createMutation(
  () => http.post('/api/comments', { postId: props.id, body: draft() }),
  { invalidates: ['/api/posts'] },
)
```

primitive（`createSignal` / `createMemo` / `createEffect`）は変えない。2 つの factory はランタイムでは signal + effect の合成で、`createForm` と同じ「コンパイラが認識する合成」にあたる。v0 の export は `createQuery`、`createMutation`、`http` の 3 つ。

## 前提が答えを決める

BarefootJS は SSR を Go や ERB など 9 つの非 JS テンプレートで行い、ハイドレーションは同期で、描画関数は再実行されない。この前提から、Solid 2.0 の道（非同期をグラフのノードの状態にする）は最初から取れない。

- **seed はコンパイラに見えていなければならない。** サーバーはテンプレートを描くだけなので、初期値（`initial`）は静的に読める位置にある必要がある。`createSignal` の第 1 引数と同じ経路。
- **pending は IR に値として見える必要がある。** `renderToTest` で状態を注入して描け、`bf debug graph` に辺が出ることが、AI がミリ秒で状況を把握するという設計目標の条件。
- **読み取りは throw しない。** 前提 1 の帰結。

そのうえで、値の有無と決着を別の軸に分ける（[[async-value-and-settlement-axes]]）と、`prev` も `idle` も消える。モード A（サーバーがデータを描く）は `initial` が必須 prop なので `posts()` の型は `T` で、Solid 2.0 と同じ `<h2>{user().name}</h2>` が書ける。モード B（シェル）は optional なので `!posts()` で畳む。どちらのモードかが prop の型に出る。

## 捨てた案と、落とした事実

試験コンパイル（[[barefootjs-async-api-compile-experiment]]）と読み味で、順に落とした。

| 案 | 落とした事実 |
| --- | --- |
| Solid 2.0 型 `createMemo(() => getUser(id()), props.user)` | 第 2 引数が client JS で落ちる。Hono の SSR shim が computation を verbatim に実行して fetcher を呼ぶ。`user.loading()` は BF044（[[barefootjs-props-reactivity]]） |
| `createSignal` の第 3 要素に状態を持ち、setter が Promise を受ける | コンパイルは通るが、`setX(promise)` の意味を黙って変える魔法で、3 要素の `createSignal` に前例がない |
| `AsyncState` をオブジェクトの値として signal に入れる | Go が BF101 で拒む（prop を参照するオブジェクトの seed は static-only の baker に焼けない）。signal 名と prop 名が同じだと silent に壊れる |
| tuple を返す helper で包む | BF110。ライブラリ helper が tuple を返すと analyzer が seed を追えない。この拒否は正しい |
| `createResource({ params, loader, initial })` + 定義側の `query('name', fn)` | 分割が冗長。`params` は memo が依存を書かないのと不釣り合い |
| fetcher が URL 文字列を返す（GET 決め打ち） | HTTP QUERY 等の body 付き読み取りを閉め出す |
| fetcher が記述オブジェクト `{ url, method, body }` を返す | 英文のように読み下せない。`http.get` 等が返す値に格下げ |
| 引数を式にしてコンパイラが thunk に包む | JSX の外で引数が再評価される唯一の場所になり、framework の中で例外になる。`() =>` を 1 トークン書いて memo / effect と揃える |
| 読みと書きを `createRequest` に統合し、HTTP メソッドの安全性でトリガを決める | 同じ形の呼び出しが引数の中身で挙動を変える。Promise を返す関数の既定が決められず `db.put(...)` が勝手に走る穴 |
| `[value, flight, action]` の 3 要素 | 読みと書きのどちらかで穴（`[, saveFlight, save]`）が空く。状態は action の状態なので action に付ける |
| DSL を `GET` / `POST` の大文字の独立関数に | export が 9 つに増え、ユーザー定義関数と被る。`http` の名前空間に畳む |

途中で採用しかけた案が 2 回「賢すぎる」で戻っている。式の暗黙の再評価と、メソッドによるトリガの決定。どちらも読み味と引き換えに暗黙の規則を置いていて、暗黙の規則は設計が古びる場所になる。

## 記述を純粋にしたことで得たもの

`http.get(url, params)` は `{ url, method, params }` を返すだけで IO をしない。この純粋さが 4 箇所で効く。

- **キー**は `method + url + body の安定直列化` で、送る前に同期で決まる。定義側の `query('posts', fn)` のようなキー登録の API が要らない。
- **mount 時に取り直さない。** init 中に関数を評価してもリクエストが飛ばないので、初回キーを得て `initial` をキャッシュに fresh として入れられる。SSR が描いた値をクライアントが即座に取り直す、という React の `useEffect` フェッチの問題は、この規則で消える。規則は SSR に依存せず、「props が先、fetch が後」の順序だけで決まる。
- **中間状態で評価されても送らずに済む。** リクエスト関数は effect の本体なので、ひし形の依存があると中間状態で 1 回余計に評価される（[[reactive-glitch]]）。評価しても IO が起きないので、runtime は各評価の記述を記録し、tick の末尾に最後の 1 つだけを送ればよい。2026-09-23 に「1 tick に 1 回送る」として spec に追加した。
- **batch や prefetch が runtime の方針になる。** 同じ tick の記述を集めて 1 つの HTTP にする DataLoader 的な処理が、コンポーネントのコードを変えずに書ける。

## 再利用は記述の側で

`createQuery` を helper に包むと、コンパイラは reactive factory の inliner で展開するしかなく、その制約（モジュール定数の参照が BF112 など）が付く。seed が呼び出し側に見えていなければならないからで、これは緩められない。再利用したいのは「どこにどう問い合わせるか」なので、`postsAt = (page) => http.get('/api/posts', { page })` を普通の関数として共有し、`createQuery` は component に直接書く。Solid Router の `query()` が resource ではなく fetch 関数を包むのと同じ切り方。

## まだ確かめていないこと

seed の経路（BF101 / BF110、`initial` が落ちる経路）は試験コンパイルで裏が取れているが、`action.isPending()` の各アダプタへの lowering、記述からのキー計算、init 中の prime は紙の上の推論で、実装 PR の fixture で固定する。`createSubscription`（WebSocket / SSE）、batch、prefetch、`<Async>` のクライアント側の畳みは語彙を予約して v0 から外した。

## 理解度チェック

```quiz
BarefootJS が Solid 2.0 の「非同期を memo に載せる」道を取れない、前提由来の理由を 2 つ挙げよ。
---
SSR を非 JS のテンプレートで行うので初期値（seed）がコンパイラに静的に見えている必要があること、pending が IR に値として見えている必要があること（`renderToTest` と `bf debug graph` の対象になる）。
```

```quiz
`http.get(...)` が IO をしない純粋な記述を返すことで、mount 時の再フェッチがどう避けられるか。
---
init 中に関数を評価してもリクエストが飛ばないので、初回のキーが同期で分かり、`initial` をそのキーでキャッシュに fresh として入れられる。初回の送信は走らない。
```

```quiz
なぜ `createQuery` を helper 関数に包むのではなく、リクエストの記述を返す関数を共有する規則にしたか。
---
`initial`（seed）は SSR のためにコンパイラが呼び出し側で読めなければならず、helper に包むと inliner の制約（BF111〜114）が付く。記述の関数は純粋なので制約なしに共有できる。
```

## 出典

- [piconic-ai/barefootjs `spec/async.md`](https://github.com/piconic-ai/barefootjs/blob/main/spec/async.md)
- [piconic-ai/barefootjs#3112](https://github.com/piconic-ai/barefootjs/pull/3112) — spec の書き直し
- [piconic-ai/barefootjs#3140](https://github.com/piconic-ai/barefootjs/pull/3140) — 「1 tick に 1 回送る」の追加
- [Solid 2.0 v2.0.0-rc.0 リリースノート](https://github.com/solidjs/solid/releases/tag/v2.0.0-rc.0)
- Angular の `packages/core/src/resource/api.ts`（`params` / `loader` / `defaultValue` の定義）

#barefootjs #async #signals #api-design
