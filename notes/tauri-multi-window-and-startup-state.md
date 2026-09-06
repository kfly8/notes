---
created: 2026-09-06
updated: 2026-09-06
title: "Tauri: 複数ウィンドウとアプリ起動順序にまつわる状態管理"
description: Tauri v2で、実行時に複数ウィンドウを開けるデスクトップアプリ(それぞれ別のファイルを独立して開ける、比較しながら作業できるもの)を作る際に踏んだ、状態管理と起動順序の落とし穴。
tags: [tauri, rust, desktop, state-management]
---
# Tauri: 複数ウィンドウとアプリ起動順序にまつわる状態管理

Tauri v2で、実行時に複数ウィンドウを開けるデスクトップアプリ(それぞれ別のファイルを独立して開ける、比較しながら作業できるもの)を作る際に踏んだ、状態管理と起動順序の落とし穴。

## `Builder::menu()` のファクトリは、Tauri自身の管理状態がまだ無い時点で呼ばれる

`tauri::Builder::default().menu(|app| { ... })` に渡すクロージャの中で `app.path()`(内部的に `PathResolver` という管理状態を読む)を呼ぶと、こうパニックする。

```
thread 'main' panicked at .../tauri-2.11.5/src/lib.rs:734:7:
state() called before manage() for tauri::path::desktop::PathResolver<...>
```

このファクトリは、Tauriが自分自身の内部状態(`PathResolver`を含む)を`manage()`し終える**前**に呼ばれる。`.manage(MyState::default())` で自分が登録したstateならこの時点でもう使えるが、Tauri自身が持つ組み込みのstateはこのタイミングではまだ無い。

**対処**: メニュー構築を、実データに依存しない「空データ版」と「実データ版」の2つに分ける。`.menu()` には空データ版を渡してプレースホルダーのメニューバーを出しておき、`.setup()`(ここではTauriの初期化が完了している)の中で実データ版を組み直して `app.set_menu()` で差し替える。

```rust
fn build_menu_with_recents(app: &AppHandle, recents: Vec<String>) -> tauri::Result<Menu<Wry>> {
    // ここでは app.path() などの管理状態を読まない/読める前提にしない
    // ... recents を使ってメニュー項目を組み立てる ...
}

// メニュー項目の実データ(ここでは「最近開いたファイル」一覧)を読むのは
// setup() 完了後の、この関数の中だけにする。
pub(crate) fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    build_menu_with_recents(app, read_recent_files(app)) // read_recent_files が app.path() を使う
}

tauri::Builder::default()
    .menu(|app| build_menu_with_recents(app, Vec::new())) // 起動直後: 空データでプレースホルダー
    .setup(|app| {
        let menu = build_menu(app.handle())?; // ここでは app.path() が使える
        app.set_menu(menu)?;
        Ok(())
    })
```

## ウィンドウごとに違うべき状態は `window.label()` をキーにする

「開いているファイルのパス」「そのファイルの監視」「そのファイル用の一時サーバー」のような、ウィンドウごとに独立しているべき状態を、単一のグローバル(`Mutex<Option<SessionState>>` のような形)で持つと、2つ目のウィンドウでファイルを開いた瞬間に1つ目のウィンドウの状態が黙って上書きされる。

**対処**: `Mutex<HashMap<String, SessionState>>` にして、キーを `window.label()` にする。状態を触るTauriコマンドは全部 `window: tauri::WebviewWindow` を引数に取り、`guard.get(window.label())` / `guard.insert(window.label().to_string(), ...)` で読み書きする(Tauriはコマンド呼び出し元のウィンドウを自動でこの引数に注入してくれる)。ウィンドウが閉じたら、`on_window_event` の `WindowEvent::Destroyed` で対応するエントリを`remove`し、監視スレッドやサブプロセスを道連れに片付ける。

```rust
pub struct Session(Mutex<HashMap<String, SessionState>>);

#[tauri::command]
fn open_file(path: String, window: WebviewWindow, session: State<Session>) -> Result<(), String> {
    let mut guard = session.0.lock().unwrap();
    guard.insert(window.label().to_string(), SessionState::new(path)?);
    Ok(())
}

// lib.rs
.on_window_event(|window, event| {
    if let tauri::WindowEvent::Destroyed = event {
        window.state::<Session>().remove(window.label());
    }
})
```

## 新規ウィンドウへ「何を開くか」を渡す: URLクエリ文字列よりPendingレジストリ

実行時に新しいウィンドウを作り、そのウィンドウ専用のリソース(開くべきファイルパスなど)を教える必要がある場面で、URLのクエリ文字列にエンコードして渡す方式を検討したが、パスに含まれうる文字のURLエンコード/デコードを自前で面倒見る必要が出てくる(このプロジェクトではエンコード用クレートを新たに足したくなかった)。

**対処**: `Mutex<HashMap<label, T>>` の「pending」レジストリを用意し、ウィンドウを作る**前**にラベルをキーとして登録しておき、新しいウィンドウのフロントエンドが起動時に一度だけ取り出す、というコマンドを1つ用意する。ウィンドウ生成前に同期的に登録が終わっているので、新しいウィンドウがマウントされた時点でレースは起きない。

```rust
#[derive(Default)]
pub struct PendingFiles(Mutex<HashMap<String, String>>);

#[tauri::command]
fn open_in_new_window(app: AppHandle, pending: State<PendingFiles>, path: String) -> Result<(), String> {
    let label = format!("window-{}", NEXT_ID.fetch_add(1, Ordering::Relaxed));
    pending.0.lock().unwrap().insert(label.clone(), path);
    WebviewWindowBuilder::new(&app, label, WebviewUrl::App("index.html".into())).build()?;
    Ok(())
}

#[tauri::command]
fn take_pending_file(window: WebviewWindow, pending: State<PendingFiles>) -> Option<String> {
    pending.0.lock().unwrap().remove(window.label())
}
```

新しいウィンドウのフロントエンドは、マウント時にまず `take_pending_file` を呼び、それが `None` だった場合だけ他のフォールバック(開発用のデフォルトファイルなど)を試す、という優先順位にする。

## 理解度チェック

```quiz
`Builder::menu(factory)`のfactoryクロージャの中で`app.path()`を呼ぶとパニックするのはなぜか?
---
このfactoryはTauri自身が`PathResolver`などの内部状態を`manage()`し終える前に呼ばれるため。`app.path()`はその内部状態を読もうとしてパニックする。空データでプレースホルダーのメニューを組んでおき、`setup()`完了後に実データで`app.set_menu()`し直すことで回避する。
```

```quiz
複数ウィンドウそれぞれが独立に開いているファイルを持てるようにするとき、その状態はどうキーイングすべきか?
---
`window.label()`をキーにした`Mutex<HashMap<String, SessionState>>`で持つ。単一のグローバルな`Option<SessionState>`のままだと、別のウィンドウが状態を開くたびに他のウィンドウの状態を上書きしてしまう。
```

```quiz
実行時に生成した新しいウィンドウへ「どのファイルを開くか」を伝える方法として、URLクエリ文字列より扱いやすかったのはどんな仕組みか?
---
`Mutex<HashMap<label, T>>`のpendingレジストリに、ウィンドウ生成前にラベルをキーとして登録しておき、新しいウィンドウが起動時に一度だけ取り出すコマンドを呼ぶ方式。パスのURLエンコードが不要で、登録がウィンドウ生成前に同期的に終わるためレースも起きない。
```

## 出典

- Tauri v2(`tauri = "2.11.3"`)で、複数のファイルを見比べながら編集できるデスクトップアプリ(スライド編集GUI)を実装する過程で遭遇。`tauri-2.11.5`のソース(`~/.cargo/registry`にvendorされたもの)で`Builder::menu`/`Builder::on_menu_event`/`Builder::on_window_event`の実装を確認した。

#tauri #rust #desktop #state-management
