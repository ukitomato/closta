# Quickstart: アプリのシェル (O-7)

自動の検証は `docs/discovery.md` の "Build / Test / Lint" 表の agent 用の列で流す (E2E は偽の supervisor)。以下は自動で見ない確認。

## V-1 画面の ID が残らない (SC-005)

Grep で `SCREENS|ScreenId|setScreen` を `src` と `e2e` に対して検索し、0 件であること。

## V-2 記録の追随 (SC-006)

- `docs/decisions/0046-app-shell-layout.md` が `status: proposed`
- roadmap の M3 に O-7 が O-3 の前にあり、O-3〜O-6 の依存に O-7 がある。Optional scope に OPT-panel
- `node scripts/constitution/check.mjs` が ok

## V-3 実機の目視 (利用者。自動の合否に含めない)

- アプリの dev 起動で、3 面の見た目が Cursor の Agent View の意図に近いか (サイドバー・中央・右の幅、畳んだ帯)
- 実 `claude` を 2 本起動し、稼働中と過去を行き来しても会話が途切れないこと
- ウィンドウを狭めたときに右 → 左の順に畳まれること
- 日本語の長い題・フォルダ名でサイドバーと概要が崩れないこと (Principle VIII)
