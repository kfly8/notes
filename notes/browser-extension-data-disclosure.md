---
created: 2026-08-23
updated: 2026-08-23
---
# ストアによって「データ収集」の定義が違う

同じ拡張機能を Chrome ウェブストアと AMO の両方に出すとき、**データ収集の申告内容は一致しない。** 両者が「収集」と呼んでいるものの範囲が違うため。

| | 「収集」の定義 |
| --- | --- |
| Chrome ウェブストア | **取り扱い**（handling）= 収集・送信・使用・共有。端末内に保存するだけでも、保存せず読むだけでも対象 |
| AMO | **データ送信** = アドオンやローカルブラウザの**外**に出ること。それ以外は対象外 |

Chrome は「拡張機能は、データが端末内で処理・保存され、外部のサーバーや第三者に送信されない場合であっても、その取り扱いを開示する必要がある」と明記している。ページを読み取ってスクレイピングすること自体が「ウェブサイトのコンテンツ」の取り扱いにあたり、保存しなくても開示対象になる。

AMO はその逆で、`browser.storage.local` に置くだけ、ページを読んで書き換えるだけなら申告不要。UI を操作する、ローカルで計算する、ローカルストレージにアクセスする、といった拡張は `"none"` でよいとされている。

## 同じ実装で申告が食い違う

外部と一切通信しない拡張（ページの文字を読んで置き換え、設定と視聴秒数をブラウザ内に保存するだけ）で、実際にこうなった。

| 実装 | Chrome | AMO |
| --- | --- | --- |
| ページ本文を読んで書き換える（保存も送信もしない） | ウェブサイトのコンテンツ **に該当** | 非該当 |
| `storage.local` にホストごとの視聴秒数 | ウェブ履歴 **に該当** | 非該当 |

結果、Chrome ではチェックボックスを2つ入れ、Firefox の manifest では `data_collection_permissions: { required: ["none"] }` を宣言することになった。**矛盾しているように見えるが、どちらも各ストアの定義に照らせば正しい。**

「通信しないから該当なし」は Chrome では通らない。ここは直感に反するので、記憶で答えず毎回定義を読み直すのが安全。

## `storage.sync` はグレーゾーン

`storage.sync` はブラウザの同期機能を通り、Google / Mozilla のサーバーを経由する。開発者には届かないが、端末の外には出る。

AMO の資料は「Firefox のインフラ内で同期されるが、実装によっては該当しうる」という含みのある書き方をしていて、白黒がついていない。利用者自身のアカウント内で完結する以上 `"none"` で通ると判断したが、指摘されたら次のバージョンで直す、という程度に構えておくのがよさそう。

なお Chrome の資料は `storage.sync` を明確に開示対象としている。

## プライバシーポリシーの要否も連動する

- **Chrome** — ユーザーデータを「扱う」なら必須。上の定義だと、ページを読むだけの拡張でも必須になる
- **AMO** — 端末から**データが送信される**場合に必須

Chrome の側が広いので、両方に出すなら Chrome の基準に合わせて1本用意しておけば足りる。リポジトリに `PRIVACY.md` を置いてその URL を渡す形でも受理される。

## [[browser-extension-publishing]]の中での位置づけ

提出フォームを埋める段の話。Chrome 側の具体的な記入は [[chrome-web-store-submission]] に、AMO 側の `data_collection_permissions` の書き場所は [[wxt]] に書いた。

## 出典

- [Updated Privacy Policy & Secure Handling Requirements | Chrome Web Store](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Limited Use | Chrome Web Store](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- [Add-ons with built-in data collection consent | Firefox Extension Workshop](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)

## 理解度チェック

```quiz
外部と一切通信しない拡張機能が、Chrome ウェブストアでデータ収集の申告を求められるのはなぜか。
---
Chrome の「取り扱い」は収集・送信・使用・共有を含み、端末内に保存するだけ、保存せず読むだけでも対象になるため。送信の有無は関係ない。
```

```quiz
ページの本文を読んで書き換えるが保存も送信もしない拡張は、AMO では何を宣言するか。
---
`data_collection_permissions` に `"none"`。AMO の「収集」はアドオンやローカルブラウザの外に出ることを指すので、非該当。
```

#ブラウザ拡張 #chrome #firefox #プライバシー
