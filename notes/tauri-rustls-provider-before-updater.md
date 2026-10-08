---
created: 2026-10-08
updated: 2026-10-08
title: reqwest を rustls-no-provider で使うなら CryptoProvider を自分で入れる
description: reqwest を rustls-no-provider で使い、Tauri updater より先に HTTPS を使うと rustls が panic する。クライアントを作る前に ring の provider を入れる。
tags: [tauri, rust, tls]
---
# reqwest を rustls-no-provider で使うなら CryptoProvider を自分で入れる

Tauri アプリの更新確認が、インストール済みの版で HTTPS クライアントの生成時に panic し、設定画面が「確認中」のまま止まった。アプリは Tauri updater より先に、自前で署名した manifest を reqwest で取りに行く構成になっている。

- `Cargo.toml`: `reqwest = { version = "0.13", default-features = false, features = ["rustls-no-provider"] }`、`rustls = { version = "0.23", default-features = false, features = ["ring"] }`。
- rustls 0.23 は、プロセス全体の `CryptoProvider` が決まっていないと TLS の設定を組み立てられない。`rustls-no-provider` の reqwest は provider を自分では入れない。
- tauri-plugin-updater は自分が通信するときに provider を用意するが、それより前に自前のクライアントを作ると未設定のまま。

インストール済みアプリのログと、同じ順序で呼ぶ回帰テストで同じ panic を確認した。

## 対処: クライアントを作る前に、無ければ入れる

```rust
fn manifest_client() -> Result<reqwest::Client, String> {
    // updater と同じ ring を使う。別スレッドが先に入れていることがあるので失敗は無視する
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
    reqwest::Client::builder().timeout(Duration::from_secs(30)).build().map_err(|err| err.to_string())
}
```

`install_default()` は2回目以降が `Err` を返すだけで、既に入っている provider はそのまま残る。updater が後から通信しても、同じ ring なので衝突しない。

配布済みの版はこの修正を自分では受け取れない（更新確認そのものが止まっているため）ので、修正版は手動インストールになった。

## [[tauri]] の中での位置づけ

アプリ内更新まわりで踏んだ1つ。Tauri のプラグインが裏で済ませている初期化に、自前の通信が先回りすると起きる。

## 理解度チェック

```quiz
Tauri updater を入れているのに、自前の reqwest クライアントの生成で rustls が panic した。なぜか。
---
reqwest を `rustls-no-provider` で使っていて、updater が provider を入れるより前に自前のクライアントを作ったため。rustls 0.23 はプロセス全体の `CryptoProvider` が無いと TLS 設定を作れない。
```

```quiz
`install_default()` を無条件に呼ばず、`get_default().is_none()` を先に見るのはなぜか。
---
別の経路（updater や別スレッド）が先に入れていることがあり、その設定を保つため。2回目の `install_default()` は `Err` を返すだけなので、呼んでも上書きはされない。
```

## 出典

- [rustls 0.23 `CryptoProvider`](https://docs.rs/rustls/0.23.45/rustls/crypto/struct.CryptoProvider.html)
- [reqwest 0.13 の feature 一覧](https://docs.rs/crate/reqwest/0.13.4/features)

#tauri #rust #tls
