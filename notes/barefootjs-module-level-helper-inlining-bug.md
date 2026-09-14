---
created: 2026-09-14
updated: 2026-09-14
title: "BarefootJS: コンポーネント外のヘルパー関数を呼ぶとコンパイラのインライン化が壊れる"
description: BarefootJS の 'use client' コンポーネントが、モジュールトップレベル(コンポーネント関数の外)に定義した普通のヘルパー関数を呼ぶと、コンパイラがその関数の中身をインライン展開しようとして、2通りの壊れ方をする。
tags: [barefootjs, compiler, csr]
---
# BarefootJS: コンポーネント外のヘルパー関数を呼ぶとコンパイラのインライン化が壊れる

[[barefootjs]] の `'use client'` コンポーネントが、モジュールトップレベル(コンポーネント関数の**外**)に定義した普通のヘルパー関数を呼ぶと、コンパイラがその関数の中身をインライン展開しようとして、2通りの壊れ方をする。CSR Adapter で検索アイランドを実装しているときに実際に踏んだ。

## 壊れ方1: 同期ヘルパー — 実行時に `ReferenceError`

```tsx
'use client'
const scoreDoc = (doc: SearchDoc, terms: string[]): number => {
  const title = doc.title.toLowerCase()
  // ...
}

function Search() {
  const results = createMemo(() =>
    docs().map((doc) => ({ doc, score: scoreDoc(doc, terms) }))
  )
  // ...
}
```

`vite build` は成功するが、ブラウザで実行すると `ReferenceError: doc is not defined`。コンパイル後のコードを見ると、`scoreDoc` の関数本体がコンポーネント初期化関数のトップレベルに、パラメータ `doc` の束縛なしで直接スプライスされていた。

```js
function Kt(e,t={}){if(!e)return;e.getAttribute("bf-s"),doc.title.toLowerCase(),doc.tags.join(" ").toLowerCase(),doc.text.toLowerCase();const n=(u,p)=>{ /* 正しくスコープされた版も別途存在 */ ...
```

## 壊れ方2: 非同期ヘルパー — ビルド自体が失敗

```tsx
'use client'
const loadIndex = async (): Promise<SearchDoc[]> => {
  const response = await fetch('/search-index.json')
  return response.json()
}

function Search() {
  onMount(() => {
    void loadIndex().then(setDocs)
  })
}
```

`vite build` が esbuild のトランスフォームで落ちる。

```
[vite:esbuild] Transform failed with 1 error:
Search.tsx:8:19: ERROR: "await" can only be used inside an "async" function
```

`loadIndex` 自身の `await` が、コンパイラが生成した非 `async` なコンテキストにインライン展開されてしまうため。

## 対処: ヘルパーはコンポーネント内のローカル関数にする

コンポーネントの状態を一切クロージャしないヘルパーであっても、コンポーネント関数の**内側**でローカルに定義すれば両方とも解決する。

```tsx
function Search() {
  const scoreDoc = (doc: SearchDoc, terms: string[]): number => { /* ... */ }
  // ...
}
```

`loadIndex` 側は非同期処理をコンポーネント内の `onMount` にそのままインライン(`.then()` チェーン)で書くことでも回避できる。

CSR Adapter で確認した挙動で、SSR 系アダプタでも同じコンパイラのパスを通るのかは未確認。

## 理解度チェック

```quiz
モジュールトップレベルの同期ヘルパー関数をコンポーネントから呼ぶと、コンパイル後のコードでは何が起きているか。
---
ヘルパーの関数本体がコンポーネント初期化関数のトップレベルにインライン展開されるが、元のパラメータ(引数名)の束縛が失われ、その識別子への参照が dangling になって実行時に ReferenceError になる。
```

```quiz
同じ問題が非同期のヘルパー関数で起きると、実行時ではなくいつ失敗するか。
---
ビルド時(esbuild のトランスフォーム)。ヘルパー自身の await が、コンパイラが生成した非 async なコンテキストにインライン展開されてしまうため。
```

```quiz
この問題を回避する最も簡単な方法は何か。
---
ヘルパー関数をモジュールトップレベルではなく、呼び出し元のコンポーネント関数の内側にローカル関数として定義する。コンポーネントの状態をクロージャしないヘルパーでも同様。
```

## 出典

- [piconic-ai/barefootjs#2986](https://github.com/piconic-ai/barefootjs/issues/2986)(自分で立てた Issue。最小再現コード付き)

#barefootjs #compiler #csr
