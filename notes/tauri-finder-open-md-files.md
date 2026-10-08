---
created: 2026-10-08
updated: 2026-10-08
title: Tauri アプリを Finder の「このアプリケーションで開く」に出す
description: bundle.fileAssociations で .md を net.daringfireball.markdown として宣言し、RunEvent::Opened で開く。Welcome 画面の main ウィンドウを使い捨てと思い込んで閉じた話。
tags: [fileassociation, tauri, macos, desktop]
---
# Tauri アプリを Finder の「このアプリケーションで開く」に出す

Finder で `.md` を右クリックしても、候補に自分の Tauri アプリが出ない。出すには Info.plist の `CFBundleDocumentTypes` にその種類の書類を宣言する必要があり、Tauri では `tauri.conf.json` の `bundle.fileAssociations` が書き込む。

```json
"fileAssociations": [
  {
    "ext": ["md"],
    "name": "Markdown",
    "role": "Editor",
    "contentTypes": ["net.daringfireball.markdown"]
  }
]
```

`.md` には macOS 標準の UTI が無い。Bear など多くの Markdown エディタは `net.daringfireball.markdown` を慣習的に使っているので、独自の UTI を `exportedType` で宣言するより、この識別子に相乗りする方が他のアプリと同じ扱いになる。`bunx tauri build` したあと `plutil -p` で `.app/Contents/Info.plist` を見ると、`CFBundleDocumentTypes` にこの UTI が入っている。

## 開く処理は RunEvent::Opened

Finder のダブルクリック、「このアプリケーションで開く」、Dock アイコンへのドロップは、どれも `RunEvent::Opened { urls }` で届く（macOS の `application:openURLs:`）。アプリが起動していなければ起動後に届く。

```rust
.run(|app_handle, event| {
    if let tauri::RunEvent::Opened { urls } = event {
        // 各 URL をどのウィンドウで開くかはここで決めない。状態を持つ層に渡す
        peitho::open_finder_urls(app_handle, &pending, &session, urls);
    }
});
```

何も開いていなければ Welcome 画面のままの `main` ウィンドウを使い回し、それ以外は「最近使った項目」と同じように新しいウィンドウを作る。新しいウィンドウに「何を開くか」を渡す方法は [[tauri-multi-window-and-startup-state]]。

## 踏んだバグ: main ウィンドウを使い捨てと思い込んで閉じる

既存のコードは、開くパスを受け取ったウィンドウは使い捨ての `deck-N` だと仮定し、開けなかったら自分を閉じていた。Welcome 画面の `main` を再利用するようにしたことで、移動・削除済みのファイルを Finder から開くとアプリ唯一のウィンドウが黙って閉じる経路ができた。ラベルを見て `main` は閉じないようにし、e2e で固定した。

書いた時点で未確認: 実機で Finder が候補に出すこと、`Opened` が届くタイミングとフロントエンド側の起動時チェックの前後関係。

## [[tauri]] の中での位置づけ

macOS との結合のうち、書類の受け取り。ウィンドウの使い回しは [[tauri-multi-window-and-startup-state]] の続き。

## 理解度チェック

```quiz
`.md` の関連付けで、独自の UTI を宣言せずに `net.daringfireball.markdown` を使うのはなぜか。
---
`.md` に macOS 標準の UTI が無く、既存の Markdown エディタの多くがこの識別子を使っているため。同じ UTI に相乗りすれば、Finder で他のエディタと同じ書類として扱われる。
```

```quiz
Finder から開いたファイルが存在しなかったとき、アプリ全体が消えた。何を仮定していたか。
---
開くパスを受け取ったウィンドウは使い捨ての `deck-N` だという仮定。Welcome 画面の `main` を使い回す経路では、その失敗処理が唯一のウィンドウを閉じていた。
```

## 出典

- [Configuration · FileAssociation · Tauri](https://v2.tauri.app/reference/config/#fileassociation)
- [tauri 2.11.5 `RunEvent::Opened`](https://docs.rs/tauri/2.11.5/tauri/enum.RunEvent.html#variant.Opened)

#tauri #macos #desktop
