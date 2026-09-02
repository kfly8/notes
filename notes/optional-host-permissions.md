---
created: 2026-08-23
updated: 2026-08-23
title: optional_host_permissions でインストール時の警告を消す
description: MV3 の拡張機能で host_permissions に <all_urls> を書くと、インストール時に「すべてのウェブサイトのデータを読み取り、変更する」という警告が出る。
tags: [ブラウザ拡張, chrome, firefox, 権限]
---
# optional_host_permissions でインストール時の警告を消す

MV3 の拡張機能で `host_permissions` に `<all_urls>` を書くと、インストール時に「すべてのウェブサイトのデータを読み取り、変更する」という警告が出る。**`optional_host_permissions` に移すと、この警告が消える。**

```json
{
  "permissions": ["storage", "activeTab", "scripting"],
  "optional_host_permissions": ["<all_urls>"]
}
```

| | `host_permissions` | `optional_host_permissions` |
| --- | --- | --- |
| 付与 | インストール時に自動 | ユーザーが操作した瞬間 |
| インストール画面の警告 | 出る | **出ない** |
| 取り消し | できない | いつでもできる |

対応バージョンは Chrome 102、Firefox 128（いずれも MV3 以降）。Firefox を含めるなら `strict_min_version` は 128 が下限になる。

## `<all_urls>` は上限の宣言であって要求ではない

ここが理解しにくいところ。`<all_urls>` と書いてあっても、それ自体を要求するわけではない。

Chrome は「宣言した範囲の**部分集合**しか要求できない」という制約をかける。だから実際に `permissions.request()` に渡すのは具体的なオリジンだけになる。

```js
// ユーザーが x.com を追加したときに要求するのはこれだけ
["*://x.com/*", "*://*.x.com/*"]
```

ユーザーが対象サイトを自由に足せる設計だと、要求しうる範囲を事前に列挙できない。**上限を `<all_urls>` にする以外に書きようがない**、というのが実情。

`permissions.request()` は**ユーザー操作のハンドラの中で最初に呼ぶ**必要がある。`await` を挟んだ後だとユーザージェスチャが失われてプロンプトが出ない。

## 権限を持っていることと、動かしてよいことは別

抜けやすい落とし穴がある。ユーザーは `chrome://extensions` から手動で「すべてのサイト」に広げられる。そうすると拡張は本当に `<all_urls>` を持ってしまう。

このとき、**付与済みの権限を起点にコンテンツスクリプトを登録すると、設定していないサイトでも動く。** 実際にこれを踏んだ。

正しくは、**設定を起点にして、権限との積を取る。**

```js
for (const site of settings.sites) {          // 起点はユーザーが設定したサイト
  const origins = originsFor(site.host);
  if (await browser.permissions.contains({ origins })) matches.push(...origins);
}
await browser.scripting.registerContentScripts([{ id, matches, js: [FILE], ... }]);
```

## コンテンツスクリプトは manifest に書けない

`content_scripts` を manifest に宣言すると、その `matches` は必須のホスト権限として扱われ、**警告が戻ってくる。** 目的が消えるので、スクリプトは実行時に `scripting.registerContentScripts()` で登録するしかない。

`persistAcrossSessions: true` にすればブラウザ再起動をまたいで残る（Chrome 96+、Firefox 105+）。それでも拡張の更新時にはクリアされるので、`runtime.onInstalled` で貼り直す必要がある。

登録処理は**冪等かつ直列**にしておく。サイトを1つ追加すると、権限付与・設定の保存・UI からの明示要求がほぼ同時に発火し、それぞれが「登録されていないな」と判断して二重に登録しようとして `Duplicate script ID` になる。存在確認をしてから登録するのではなく、無条件に解除してから登録し、Promise のキューで直列化するのが確実。

```js
let queue = Promise.resolve();
function sync() {
  const run = queue.then(register, register);
  queue = run.catch(() => {});   // 失敗が後続を止めないように
  return run;
}
```

## 代償

体験は完全にただではない。**サイトを追加するたびに権限ダイアログが1回出る。** インストール時に1回まとめて怖い警告を見せるか、使うたびに小さく尋ねるかの選択になる。

Firefox では付与の導線が Chrome と違い、about:addons の権限タブ寄りになる。

## [[browser-extension-publishing]]の中での位置づけ

manifest の書き方の話で、ストアへの提出より手前。ここで採った設計が、[[chrome-web-store-submission]] のテスト手順や権限の理由の書き方に響いてくる。

## 出典

- [optional_host_permissions | MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/optional_host_permissions)
- [scripting.RegisteredContentScript | MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/RegisteredContentScript)

## 理解度チェック

```quiz
`optional_host_permissions: ["<all_urls>"]` と宣言した拡張は、インストール直後にどのサイトへアクセスできるか。
---
どこにもアクセスできない。これは「将来これらを要求しうる」という上限の宣言で、実際の付与はユーザーが操作した時点に個別に起きる。
```

```quiz
付与済みのホスト権限を起点にコンテンツスクリプトを登録すると、何が起きるか。
---
ユーザーが手動で「すべてのサイト」に広げていた場合、設定していないサイトでもスクリプトが動く。起点は設定側にして、権限との積を取る。
```

```quiz
サイトを1つ追加しただけで `Duplicate script ID` が出るのはなぜか。
---
権限付与・設定の保存・UI からの要求がほぼ同時に発火し、それぞれが存在確認を通り抜けて二重に登録するため。無条件の解除と Promise キューによる直列化で防ぐ。
```

#ブラウザ拡張 #chrome #firefox #権限
