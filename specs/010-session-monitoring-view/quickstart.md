# Quickstart: セッション監視ビュー (O-1)

検証の手順。合否の定義は spec の SC を正とし、ここでは手順だけを書く。

## 前提

- ビルド済み (`out/main/index.js`)。agent 用のコマンドは [docs/discovery.md](../../docs/discovery.md) の "Build / Test / Lint" 表
- V-3 だけ: 実行中の WSL ランタイム・その中の `claude`・既定 Provider で `claude` が応答できること。作業フォルダには**秘密を含まない使い捨てのリポジトリ** (例: 本リポジトリの clone。読み取りで数十ファイルを辿れるもの) を登録して使う

## V-1 単体と component テスト (SC-001 / SC-002 / SC-006)

Vitest で `src/renderer/src/features/session/` と `App` のテストを実行する。導出 (`session-view.test.ts`)・ストア (`running-session-store.test.ts`)・一覧 (`RunningSessionList.test.tsx`)・live region (`SessionAttentionAnnouncer.test.tsx`) が緑であること。

## V-2 E2E (SC-003 / SC-004)

`e2e/multi-session.spec.ts` を実行する。

- SC-003: 10 本を起動し compact に切り替え、10 行がスクロールなしで見え、行に横あふれが無く操作が行の内側にある
- SC-004: comfortable で経過時間と直近の活動が出ていることを確かめてから X-5 SC-003 の負荷を流し、入力遅延 p95 と long task の最大が閾値内。annotation の値を quickstart-results に写す

## V-3 実機計測 (SC-005。CI に載せない。利用者が実行する)

```text
CLOSTA_PERF_FOLDER=<作業フォルダの表示名> CLOSTA_PERF_RUNTIME=<ディストロ名> \
  node node_modules/@playwright/test/cli.js test -c playwright.perf.config.ts
```

0. 先に安全柵を確かめる: `CI=1` を付けて実行すると即座に失敗する / `CLOSTA_E2E=1` を付けて実行すると失敗する
1. 起動前に、ホストの `wsl.exe` の数と WSL 内の `claude` の数を控える
2. 実アプリが起動し (結果に `composition: real` が出る)、10 本のセッションを起動して既定のプロンプト (research R-07) を送る
3. 10 本が応答中になったら、1 本目を表示して 30 秒間打鍵する
4. 出力を quickstart-results に記録する。**写してよいのは spec SC-005 の許可リストの項目だけ**とし、本文や env は写さない。端末の出力をそのまま貼らない
5. ホストの `wsl.exe` と WSL 内の `claude` の数が手順 1 の値に戻ったことを確かめて記録する (無効になった回も含め、各回の後に行う)。残っていたら WSL 内の該当する `claude` を止め、AD-043 Decision 5 の残余として X-6 に記録する
   - 出力に `[O-1 SC-005] teardown=killed` の行が出た回は、後始末が kill に落ちている (Electron の main の PID だけを終わらせ、WSL 内の `claude` が残りうる)。その回は必ず `wsl -d <ディストロ名> -- ps -eo pid,etime,args` で残ったプロセスを確かめる (pr-gate R1 platform-boundary L-001)
   - 実行後に outputDir (`%TEMP%\closta-perf-results\`) の下に `.last-run.json` 以外が無いことを確かめる。`error-context.md` などがあれば会話由来の文字列が残っているので、消してから記録に残す (pr-gate R1 security M-001)
6. 有効な回が 3 回そろうまで繰り返す。**そろうまで pr-gate に進まない** (spec FR-012 の完了条件。**2026-10-02 に改訂** — 有効な回 0 件で利用者が SC-005 を閉じた。spec FR-012 の改訂の行)。有効な回で閾値を割ったら止めて利用者が判断する

トークンを消費する。プロンプトを短くしたい場合は `CLOSTA_PERF_PROMPT` で差し替え、その旨 (識別子) を記録する。計測で作られた会話の履歴 (transcript) は WSL 内に残り、R-2 のセッション一覧に並ぶ。アプリはこれを消さない (Principle X)。

## V-4 目視 (spec US-1 / US-3)

1. 3 本を起動し、表示していない 1 本で承認を要する操作を求める (例: `Bash` を使わせる)
2. その行が強調され、見出しの件数が 1 になる。件数を押すとそのセッションに移り、承認カードが見える
3. 「作業フォルダ」画面に移り、直前まで選んでいたセッションで承認を要する操作を求めると、ナビの「セッション起動」に承認待ちの件数が出る。別の 1 本を失敗させると、失敗の件数が別に出る。失敗は `wsl --terminate` で起こさない (ディストロ内の他のプロセスまで止まる)。そのセッションの `claude` だけを止める (`wsl -d <ディストロ名> -- ps -eo pid,etime,args` で起動直後の PID を確かめ、`wsl -d <ディストロ名> -- kill <PID>`)
4. compact に切り替え、行の操作 (終了・強制終了) が押せること、行にポインタやフォーカスを当てると直近の活動が見えることを確かめる (スクリーンリーダーでの読み上げは O-1 では目視しない。利用者判断 2026-10-02。component テストで代替)
5. 全角の長い表示名 (例: 30 文字) の作業フォルダで起動し、compact の行が横にあふれず操作が行の内側にあることを確かめる (Principle VIII)
6. compact で、**失敗の行** (手順 3 で起こしたもの) と全角の長い表示名の組み合わせで、行が横にあふれず操作が行の内側にあり、印の横の短い理由が切り詰められて読めることを確かめる。ツールチップと行へのフォーカスで理由の全文が読める (E2E の偽 supervisor は失敗を流さないので、失敗の行の幅は E2E で測れない。pr-gate R2 po M-101)

## V-5 境界の差分 (SC-006)

```text
git diff --name-only main...HEAD -- src/main src/preload src/agents src/domain
```

が 0 件であること。あわせて `.github/workflows/verify.yml` に perf の実行 (`playwright.perf`) が無いこと (型検査の `-p perf/tsconfig.json` だけ) を確かめる。
