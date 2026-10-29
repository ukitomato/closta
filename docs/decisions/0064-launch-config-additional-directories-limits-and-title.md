---
status: accepted
date: 2026-10-29
id: AD-064
deciders: ukitomato
tags: [session, sdk, permission, launch-config, preset, constitution-check]
supersedes: []
superseded-by: []
---

# AD-064: 起動設定に追加ディレクトリ・上限・セッション名を足す — `QUERY_OPTION_KEYS` を 16 にし、`additionalDirectories` を登録フォルダの変換値に限って許す

本 ADR は X-6 の 2 本目 ([spec 024](../../specs/024-session-launch-axes/spec.md)) の plan で起こした。spec の U-1〜U-9・plan の P-1〜P-11 と本 ADR は、2026-10-29 の夜間の規則 (承認の要る判断は推奨案で採用して進む) で推奨案を採用し、2026-10-29 に accepted とした。規則の詳細の正本は [data-model.md](../../specs/024-session-launch-axes/data-model.md) で、本 ADR は決定と読み替えだけを書く。調査は [research.md](../../specs/024-session-launch-axes/research.md)。

## Context

024 は起動ダイアログで選べる軸を 6 から 9 に増やす (追加ディレクトリ・ターン数と費用の上限・セッション名)。値は SDK の `query()` の options (`additionalDirectories` / `maxTurns` / `maxBudgetUsd` / `title`) で渡す。

- [AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (g) は `QUERY_OPTION_KEYS` に「escalation-neutral (権限面・tool 集合・env を変えない) のキーだけを足す」とし、集合を変えるには ADR が要る (`session-core.test.ts` の pin テスト)。今の集合は 12
- `additionalDirectories` は権限モード・`canUseTool`・tool の集合・env を変えないが、Claude Code の権限の判定で「作業ディレクトリの中」として扱う範囲を広げる。その範囲の読み取りは承認なしで通る (research R-02)。厳密には escalation-neutral ではない
- AD-041 (h) は X-6 に「追加ディレクトリのパス入力を renderer に足すとき、IPC へ渡すパスは capability の戻り値由来に限る」を預けた (`tests/rule-fixtures/expected.mjs` の `ui-path-concat`)
- [AD-042](0042-provider-type-refinement-and-d4-lapse.md) Decision 4 の「今後の規則」は、既存レコードが旧版の検証で拒否される変更 (X-6 の軸の追加) で schemaVersion を上げ、版ごとの読み替えを store の内側に置くことを求める
- `SessionLaunchConfig` は X-4 以来 6 軸で、X-9 ([AD-059](0059-session-resume-query-option-and-conversation-id.md)) は 6 軸の形のまま再開の要求を作った。[AD-062](0062-live-session-permission-mode-model-and-rename.md) Consequences は「`SessionLaunchConfig` は変わらない」(023 の範囲) とした

## 読み替える箇所

| 先行の決定 | 読み替え |
|---|---|
| AD-041 (g) (`QUERY_OPTION_KEYS` には escalation-neutral のキーだけを足す) | `maxTurns` / `maxBudgetUsd` (止めるだけ) と `title` (表示の値) は escalation-neutral として足す。`additionalDirectories` は読み取りの範囲を広げるが、Decision 2 の 2 つの条件を満たす値に限って足す (Decision 1 / 2)。他のキーは今どおり escalation-neutral に限る |
| AD-041 (h) (追加ディレクトリのパス入力の強制は X-6) | 024 はパスの入力を足さず、登録フォルダの id で選ぶ。強制の対象が生じないことを rule fixture の `howToClose` に記録し、`nextFeature` は X-6 の後続 (退避ファイルの UI) に残す (Decision 2) |
| AD-041 の `SessionLaunchConfig` の 6 軸・AD-059 の再開の要求の形・AD-062 Consequences の「`SessionLaunchConfig` は変わらない」 | 10 キーに広げる (Decision 3)。再開は引き継ぐ 3 軸の照合を変えず、名前は `null` に限る (Decision 5)。AD-062 の記述は 023 の範囲の事実で、本 ADR の後は 10 キー |
| AD-042 Decision 4 の今後の規則 | `presets.json` を版 2 にし、版 1 の読み替えを `preset-record.ts` に置く (Decision 4) |

## Decision

1. **`QUERY_OPTION_KEYS` に 4 キーを足す (12 → 16)。** `additionalDirectories` / `maxTurns` / `maxBudgetUsd` / `title`。どれも値があるときだけ載せる。main の検証・agents の decoder (`decodeLaunchOptions`)・`buildQueryOptions` の assert の 3 段で範囲と形を検査し、エラーのメッセージに値を入れない。`taskBudget` (`@alpha`)・`maxThinkingTokens` (deprecated)・settings の `permissions.additionalDirectories` は使わない
2. **`additionalDirectories` の値は、登録済みの作業フォルダを main が選択ランタイムのパスに変換したものに限る。** renderer は folder id だけを送り、パスの値を作らない・入力させない。main の起動ゲートは依存解決を再評価し (外す項目が 1 つでもあれば拒否)、各 id を `resolveFolderRuntime` で変換して、到達できない・名前空間が違うときは拒否する。agents は WSL の起動では POSIX の絶対パス、Win32 の起動ではドライブ付きの正規化済みのパスだけを通す。件数は 0〜10。登録済みのフォルダは作業フォルダに選べば同じ範囲を承認なしで読めるので、この条件の下で読み取りの範囲は利用者が Closta に登録した場所の外へ広がらない。書き込みは今どおり権限モードと承認で決まる
3. **`SessionLaunchConfig` を 10 キーにする。** 足すキーは `additionalDirectoryIds` (folder id の配列)・`maxTurns` (1〜1000 の整数か null)・`maxBudgetUsd` (0.01〜1000・小数 2 桁までか null)・`sessionName` (023 の名前の規則を通った文字列か null)。4 つとも必須のキーで、既定は空の配列と null で表す。プリセットの config は `sessionName` を除いた 9 キー (`PresetLaunchConfig`)
4. **`presets.json` を版 2 にする。** 版 1 のファイルは版 1 の 6 キーで検証し、新しい軸を既定 (追加ディレクトリなし・上限なし) で補って読む。退避も書き戻しもしない。書き出しは版 2 で、版 3 以上は今の規則で退避する。IPC の `checkPreset` と `preset-record` は同じ述語を使う。名前はプリセットに保存しない
5. **再開と名前。** 追加ディレクトリと上限は再開で選び直せる軸とする (会話の所在を決めない)。再開の要求の `sessionName` は `null` に限り、`title` を渡さない (SDK は再開で記録済みの題を優先する)。起動に成功したら main の registry の名前 (AD-062 Decision 4 の欄) を起動の名前で初期化する。名前は永続化しない (Principle X)

## Consequences

- 起動の IPC・再開の IPC・プリセットの保存の IPC の値の形が広がる (channel と関数の形は変わらない)。テストの fixture の起動設定は 4 キーを足す必要がある
- 版 2 の `presets.json` を本 ADR の前の版のアプリが読むと `schema-version-unknown` で退避される (今の規則。黙って欠けない)
- 追加ディレクトリの中の読み取りは `default` でも承認なしで通る (Claude Code の作業ディレクトリの扱い)。利用者がこれを望まないときは追加ディレクトリを選ばない
- 上限の数え方 (プロンプトごとか、セッションを通してか・再開の前を含むか) は SDK に任せ、Closta は値を渡して O-4 の理由を出すだけ
- `title` は stdin の初期化の要求で届き、argv を通らない。`--add-dir` / `--max-turns` / `--max-budget-usd` は CLI の引数で、作業フォルダの `--cd` と同じく `wsl.exe --exec` (シェルを通らない) か `claude.exe` の直接の起動に渡る

## 訂正 (2026-10-30 / 024 design-gate H-004)

AD-031 の訂正節である。決定 (Decision 1〜5) は変えず、Context の 2 つ目と Decision 2 の根拠の事実誤認を正す。

- **誤り**: Context と Decision 2 は、`additionalDirectories` が広げるのは「承認なしで読める範囲」だけとしていた
- **事実** (Claude Code の文書と sdk.d.ts。詳細は [research R-02a](../../specs/024-session-launch-axes/research.md)): `--add-dir` のディレクトリから Claude Code は `.claude/skills/` を読み込む。CLAUDE.md は環境変数 `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` のときだけ読み込む。`.claude/settings.json` (hooks・permissions・env)・`.mcp.json`・plugins は追加ディレクトリからは読み込まない。skills の `allowed-tools` は、その skill が動いている間の承認を省く
- **正した根拠**: Decision 2 の条件 (登録フォルダの main の変換値に限る) の根拠は「**登録フォルダの設定一式を、作業フォルダに選んだときと同じく信頼する**」である。同じフォルダを作業フォルダに選べば skills・CLAUDE.md に加えて settings・hooks・`.mcp.json` まで読み込まれるので、追加ディレクトリで読み込まれるものはその部分集合で、登録した場所の外の設定は入らない (spec U-10)
- **Consequences に足すこと**: 追加ディレクトリの skills (と、環境変数のときの CLAUDE.md) がモデルの文脈に入る。利用者が望まないときは追加ディレクトリを選ばない。実機で読み込まれるものは 024 quickstart V-1 の手順 8 / 9 で記録し、hooks・`.mcp.json` が読み込まれるなど上の事実と違えば利用者に返す (024 plan RK-02 と同じ扱い)

## Alternatives

- **任意のパスを入力させる・参照のダイアログで選ばせる** — renderer にパスの値が生じ、`ui-path-concat` の未検出の経路 (DTO を spread して `value` を差し替える) を開く。登録していない場所に読み取りの範囲が広がる
- **追加ディレクトリを settings の `permissions.additionalDirectories` に載せる** — AD-040 の settings の 2 キーの射影を広げることになり、検査の段が別になる
- **名前を起動の要求の別の欄にする** — IPC の関数の形・`lastConfig` の復元の経路が変わる (research R-03)
- **`presets.json` の版を 1 のまま新しいキーを任意にする** — 旧版のアプリがキーの allowlist で新しいプリセットを黙って読み飛ばす
- **起動の後に `renameSession` を自動で呼ぶ** — 会話の id が決まるまで名前が付かず、改名の子の起動とプロンプトの保留を起動のたびに伴う

## Confirmation

- `session-core.test.ts` の pin テストが 16 キーをリテラルで固定する。`buildQueryOptions` と `decodeLaunchOptions` のテストが、4 キーの載る条件と、範囲外・形の外・WSL の起動の Windows のパスでの throw / 拒否を確かめる (024 SC-003)
- 起動ゲートの単体テストが、追加ディレクトリの未登録・到達できない・名前空間の不一致で `invalid-config` になり `query()` が呼ばれないことを確かめる (024 SC-003)
- `preset-store.test.ts` が版 1 の読み替え・版 2 の往復・名前を持つレコードの拒否・将来版の退避を確かめる (024 SC-004)
- 024 quickstart V-1 で、追加ディレクトリの読み取りの振る舞い (承認の有無) と日本語・空白を含むパスの `--add-dir` を実機で記録する
