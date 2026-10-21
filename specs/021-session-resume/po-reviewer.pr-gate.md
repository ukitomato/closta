# po-reviewer Review: セッションの再開 (resume) (X-9)

**Run**: 2026-10-22T00:00:00+09:00
**Reviewer**: po-reviewer
**Spec**: specs/021-session-resume/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-017 は全部この PR で実装されている (renderer: FR-001/002/006/007/009/010/012/013、main: FR-003/004/005/008/011/014、agents: FR-003/004/017、docs: FR-015/016)。SC-002〜SC-006・SC-008 と、SC-007 / SC-009 の自動検証の部分がマージの条件。SC-001・SC-007 の V-2・SC-009 の V-9 は実機の確認の条件で、`quickstart-results.md:22` に「未実施」と記録され、roadmap の X-9 の行 (`docs/roadmap.md:386`) にも未確認として残っている。spec の「合否の扱い」どおり。
- touched files に該当する charter / Confirmation: session charter の Journey 4 (`docs/domains/session/charter.md:123-130`)、業務ルール「再開時の軸の引き継ぎ」(`:184`)、KPI「再利用率」(`:209-`)。起動元の規則は design-gate の H-002 を受けて `LaunchDialog.resume.test.tsx:369-403` に入っている。AD-059 の Confirmation (V-1 / V-3 / V-4) は実機が未実施。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当
- E. User Story / SC / AC / UX: Critical:0 High:0 Medium:2 Low:3
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: 該当なし: ux / a11y-reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

この PR はセッションの再開を実装する。対象は、過去の区画の行 (`PastResumeBar`) と、稼働中の区画の終了済み・失敗した行 (`resumeActionFor` / `useRowActionRunner`)。再開は起動ダイアログの再開の形で行い、引き継ぐ 3 軸は表示だけ、選び直せる 3 軸は元の値を初期値にする。main は `session-launch-service.ts` で会話の id を registry に持ち、次を行う。
- 同じ会話の 2 本目は `already-running` / `conversation-running` で止める
- 受け付けたら元の行を入れ替える
- options に `resume` を足す

agents は `system/init` の `session_id` を運び、権限モードが安全 3 値の外なら `resume-failed` で fail closed にする。中央はそれまでの会話を先頭に読み取り専用で出す。読み取りに失敗したら 1 行で知らせる。

AC は US-1〜US-4 のほぼ全部に component / 単体 / E2E のテストがある。残る問題は 2 つ。
- 拒否したときの回復の流れが、一部の理由で行き止まりになっている
- 実機でしか確かめられない SDK の振る舞い (RK-02 / RK-07) に、価値の核 (SC-001) が全面的に依存している

## Findings

### [Medium] `cwd-mismatch` の拒否文は「そのディレクトリを登録」と指示するのに、登録の導線もパスも出さない (M-001) (scope: feature)

- **観察**:
  - `src/renderer/src/features/session/labels.ts:82-83` の `cwd-mismatch` の文言は「この会話の作業ディレクトリは、登録フォルダの下の別のディレクトリです。そのディレクトリを作業フォルダとして登録してから再開してください」。
  - 一方、`src/renderer/src/features/session/PastResumeBar.tsx:107` は「作業フォルダとして登録」を `folder-unregistered` のときだけ出す。しかも `registerSeedOf` (`src/renderer/src/features/session-list/register-seed.ts:14`) は `group.kind !== 'unregistered'` のとき null を返す。登録フォルダの下のサブディレクトリの行は、`matchFolder` が `folder` を返すので登録済みの群に入る。そのため seed は作られない。
  - テストはこの欠けを仕様として固定している: `PastResumeBar.test.tsx:105-109`「他の理由では登録の導線を出さない」。
  - 一方、入れ子の登録は弾かれない (`src/domain/workspace/registry.ts:24-31` は key の一致だけを見る)。直し方はあるのに、入口が無い。
- **同種事象探索**: `reason === 'folder-unregistered'` で導線を出す箇所は `PastResumeBar.tsx:107` の 1 件。直し方を文言で指示しながら導線の無い理由は `cwd-mismatch` (`labels.ts:82`) の 1 件。
- **リスク/影響**: CLI で登録フォルダのサブディレクトリから始めた会話は普通にある。その会話は全部この拒否に当たる。利用者は自分でパスを調べてフォルダ登録ダイアログに打ち込む必要がある。しかも文言はパスを含めない方針で、帯にもパスは出ない。U-3 が拒否を採った理由「未登録の行は今の R-2 の登録の導線で直せる」が、この理由では成り立っていない (PO-6 のエラー時の出口)。
- **推奨アクション**: `resolvePastResume` の `cwd-mismatch` の答えに登録の初期値 (所在・cwd・表示名の候補。main が組む) を載せ、`PastResumeBar` で `folder-unregistered` と同じ「作業フォルダとして登録」を出す。`PastResumeBar.test.tsx:105` のケースは `cwd-mismatch` で導線が出る形に直す。導線を足さない場合は、文言から「登録してから」を外して事実だけにする。
- **根拠**: spec U-3 / FR-005「理由と直し方」、PO-6
- **scope 根拠**: touched files (`PastResumeBar.tsx`・`labels.ts`・`resume-service.ts`) だけで直せる

### [Medium] `location-mismatch` / `location-unknown` の文言に直し方が無い (FR-005 の「理由と直し方」) (M-002) (scope: feature)

- **観察**:
  - `labels.ts:88-89` の `location-mismatch` は「…Closta からは再開できません」。
  - `labels.ts:85` の `location-unknown` は「…所在が分からないため、再開できません」。
  - どちらも直し方を含まない。FR-005 (`spec.md:185`) は「どれかが決まらない・一致しなければ、理由と直し方を出して再開を拒否する」と定めている。他の 7 理由の文言は直し方を含む。
- **同種事象探索**: `RESUME_UNAVAILABLE_LABELS` の 9 値のうち、直し方の無いものは 2 件 (`labels.ts:85`・`labels.ts:88`)。
- **リスク/影響**: 利用者は行き止まりになり、会話を続ける手段を知らされない。とくに `location-mismatch` (ホストの記録にある `\\wsl$\…` の cwd) は、その環境の端末で `claude --resume` すれば続けられる。Closta の外に代わりの経路があるのに案内していない。
- **推奨アクション**: 2 つの文言に代わりの経路を足す。`location-mismatch` は「会話を記録した環境の端末で `claude --resume` を使ってください」の形、`location-unknown` は「一覧を再取得してください」の形 (会話の id とパスは入れない)。もう 1 つの手として、spec の FR-005 を「直し方がある理由は直し方を出す」に読み替える案もあるが、それには spec の修正が要る。
- **根拠**: FR-005、PO-3 / PO-6
- **scope 根拠**: `labels.ts` (touched)

### [Medium] 価値の核 (US-1 AC3 / SC-001) を検出する自動テストが無く、SDK の振る舞いの前提 (RK-02 / RK-07) で失敗の見え方が変わる (M-003) (scope: feature)

- **観察**:
  - 自動の計測経路はすべて偽の capability と単体の範囲にある。E2E は `e2e/session-resume.spec.ts:61/82/110` の 3 本で、どれも稼働中の行の入れ替えだけを見る。
  - 「`claude` が前の文脈に答え、同じ transcript に追記される」ことは実機でしか確かめられない。その実機 V-1〜V-9 は全部未実施 (`quickstart-results.md:22`)。
  - 会話の記録が消えたときの終わり方は plan の RK-07 (`plan.md:268`) が未確定としている。`init` の後に終わると `process-crashed` (「異常終了」) になる。そのうえ再開した行は要求の会話の id を registry に持つ (`session-launch-service.ts:334`)。つまり失敗した行には再び「再開」が出て、同じ失敗を繰り返しうる。
- **同種事象探索**: `resume-failed` を判定する分岐は agents の `crashReason` の経路だけ (plan §agents)。renderer 側で「記録が見つからない」を見分ける経路は 0 件。
- **リスク/影響**: 実機で RK-07 が当たると、記録の消えた会話の再開は「異常終了」と出る。行には「再開」が出続け、利用者は原因を知らされずに再開を繰り返す (PO-4 の異常系の入力)。
- **推奨アクション**: このラウンドで直すものではない。実機の V-4 の結果を roadmap の X-9 の行の未確認の項目として明示的に残す (今の行は V-0〜V-9 をまとめて書いている)。そこに「V-4 が合わなければ、失敗した再開の行の『再開』を `resume-failed` の後で出さない」ことを申し送りとして足す。
- **根拠**: spec Edge Cases「transcript が消された・壊れた」、plan RK-07、PO-4
- **scope 根拠**: roadmap と quickstart-results (touched) での記録

### [Low] 「やり直す」は、ダイアログを確定する前に失敗の行を閉じる (L-001) (scope: feature)

- **観察**: `resume-action.ts:63-66` は `retry` で先に `store.close(sessionId)` を呼び、その後でダイアログを開く。ダイアログで取り消すと、失敗の行と失敗の表示が戻らない。テスト `resume-action.test.tsx:241` はこの順序を固定している。
- **推奨アクション**: 「再開」(FR-010。受け付けで閉じる) と同じく、起動を受け付けたときに閉じる形に揃えるか検討する。
- **根拠**: PO-6

### [Low] Journey 4 の注記が、手順 2 の「上限」を X-9 の範囲外として示していない (L-002) (scope: feature)

- **観察**: `docs/domains/session/charter.md:125` は「手順 1〜2 の再開は X-9」と書く。しかし手順 2 (`:128-129`) が挙げる選び直せる軸には「上限」が入っている。spec の Out of Scope (`spec.md:255`) は上限を X-6 に残している。
- **推奨アクション**: 注記を「手順 1〜2 (上限を除く。上限は X-6)」に直す。

### [Low] 中断しただけの行で軸を変えて続けたいとき、「終了 → 再開」の経路が案内されていない (L-003) (scope: feature)

- **観察**: U-8 / FR-002 によって、中断済みの行には「再開」が出ない (`resume-action.ts:33`)。Journey 4 の手順 1→2 (中断して、モデルなどを選び直す) は、利用者が先に「終了」を押さないと成り立たない。この経路はどの文言にも出てこない。
- **推奨アクション**: X-6 で動いているセッションの設定変更を作るまでの間の案内を検討する。たとえば中断の表示に「モデルを変えて続けるには終了してから再開」と添える。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `folder-unregistered` (PastResumeBar の導線) / 直し方を指示する `cwd-mismatch` | 1 / 1 | src/renderer/src/features/session/PastResumeBar.tsx:107, src/renderer/src/features/session/labels.ts:82 |
| M-002 | `RESUME_UNAVAILABLE_LABELS` のうち直し方の無い文言 | 2 | src/renderer/src/features/session/labels.ts:85, src/renderer/src/features/session/labels.ts:88 |
| M-003 | `resume-failed` の判定の経路 / renderer 側の「記録なし」の判別 | 1 / 0 | plan.md:212 (agents の crashReason), src/main/app/session-launch-service.ts:334 |

## Verdict

- Critical: 0
- High: 0
- Medium: 3
- Low: 3
