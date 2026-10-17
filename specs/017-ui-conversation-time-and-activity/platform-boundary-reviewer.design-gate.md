# platform-boundary-reviewer Review: 会話の時間と活動の可視化 (O-9)

**Run**: 2026-10-16
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/017-ui-conversation-time-and-activity/spec.md

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-005 (時刻の出所と検査。agents と domain の変換を触る。これが本 reviewer の担当スライスに入る唯一の部分), FR-006〜FR-013 (renderer の表示のみ), FR-014〜FR-016 (記録) / SC-001, SC-002, SC-005 (境界を広げないこと)
- touched files に該当する charter / Confirmation: Principle II (時刻の書式はローカルの `Intl.DateTimeFormat` で、OS で分けない。plan:67), Principle VII (agents が新しく import するのは `domain/session/transcript-time.ts` だけ。plan:72, quickstart:19), AD-003 (ランタイムが複数あること。所要時間を計算するときの時計の出所に関わる), AD-012 (docker endpoint の時計), AD-051 Decision 2/3/5 と Consequences。AD-004 (パス型) は該当しない。パスを扱わない
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の担当
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当 (`parseMessageTime` の未信頼入力の検査も B に属する)
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:1 Low:0
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:0
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の担当
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## スコープ要約

O-9 は、すでにある `createdAt: number | null` に値を入れる。値の出所は 3 つ。過去ログは `getSessionMessages` の返りに含まれる、公開の型に無い `timestamp`。実行中は SDK の `timestamp` で、無ければ agents が受け取った時刻。利用者の入力は renderer がストアに積んで送った時刻。renderer はその値からターン・会話の地図・活動の帯を導く。DTO の形、IPC / preload / main、query の options、Agent SDK の呼び出しの許可リストは変えない (FR-005 / SC-005)。パスの値・ランタイムの capabilities・権限モード・docker endpoint・永続環境には触れない。プラットフォーム境界で問題になりうるのは 1 点だけ。所要時間を計算するときに、ランタイム側の時計とホスト側の時計を混ぜている点である。

## 固有観点

- **PB-1 (パス型の消失)**: 該当なし。新しく IPC / MessagePort を越える値は `createdAt` (epoch ms の数) だけで、パスは含まない。会話の地図の「入力の先頭」は利用者が書いた本文を text として描くだけで (data-model.md:107, :113)、パスとして解釈しない。
- **PB-2 (単一インスタンスの仮定)**: 該当なし。中央の会話の公開口は `ShellLayout` に 1 つあるが、持つのは「中央に表示中の会話」で、ランタイムではない。`conversationKey` は過去ログでは `selectedRowKey` で、これは `targetKey\0sessionId` (`src/domain/session/summary.ts:59`) なのでランタイムの識別子を含む。稼働中は既存の `ConversationSearchProvider key={live.sessionId}` (`src/renderer/src/features/shell/CenterPane.tsx:94`) と同じキーを使い、過去ログのキーとは書式が異なるので衝突しない。module スコープの「現在のランタイム」も新設しない。
- **PB-3 (capabilities の虚偽表明)**: 該当なし。`AgentRuntime` の実装と capabilities を変えない。
- **PB-4 (権限ゲートの迂回)**: 該当なし。権限モード・プリセット・resume / fork の経路を触らない (plan.md:68)。
- **PB-5 (多段パス変換)**: 該当なし。パスの変換も bind mount も扱わない。
- **PB-6 (永続環境)**: 該当なし。時刻・ターン・区間はどれも永続化しない (data-model.md:20, AD-051:33)。ボリューム・ディストロ・ホームディレクトリへの書き込みは無い。
- **PB-7 (lint ルールの網羅性)**: 該当なし。新しいファイルは既存のレイヤ規則の範囲に入る。agents 側で増える import は `@domain/session/transcript-time` だけで、そのファイルは「import を持たない」と定められている (plan.md:40, tasks.md:24)。したがって Principle VII の間接 import の穴を新たに作らない。`process.platform` に相当する分岐もない (書式は `Intl.DateTimeFormat('ja-JP', …)` で、OS によって分けない。data-model.md:159)。

## Findings

### [Medium] 実行中のターンの所要時間が、ランタイムの時計とホストの時計の差をそのまま含む。過去ログで見ると値が変わる (M-001) (scope: feature)

- **観察**:
  - 実行中、ターンの始まり (利用者の入力) の `createdAt` は renderer のストアの `now()`、つまりホストの時計である (`specs/017-ui-conversation-time-and-activity/data-model.md:53`)
  - ターンの終わりの assistant は `parseMessageTime(msg.timestamp, receivedAt) ?? receivedAt` (`data-model.md:48`) で決まる。`timestamp` が付いていれば、それは Claude Code の CLI がランタイムの中 (WSL ディストロ、または AD-012 の docker コンテナ) で付けた値である
  - `durationMs = endedAt - startedAt` (`data-model.md:87`) は、この 2 つの時計の差をそのまま引き算に含む。負になったときだけ隠す
  - 過去ログでは始まりも終わりもランタイム側の記録の `timestamp` なので (`data-model.md:44`)、同じターンの所要時間が「実行中に見た値」と「終わってから過去ログで見た値」で異なる
  - AD-051 はこの現象を「WSL の Claude Code の時計とアプリのホストの時計が混ざりうる。所要時間が負になる・小さくずれる」(`docs/decisions/0051-message-time-source-and-display-only.md:39`) と書き、plan RK-03 (`plan.md:246`) と research R-02 (`research.md:29`) も同じく WSL だけを挙げている。docker endpoint (AD-012) のコンテナの時計には触れていない
- **同種事象探索**: Grep `WSL|Docker|docker|ランタイム|時計` を spec dir の quickstart.md / tasks.md に対して実行した。ランタイムの種別を指定した確認は 0 件。時計の差を固定するテストも 0 件 (tasks.md:25, :34, :40, :44 の偽の時計はどれも単一の時計を使う)
- **リスク/影響**: AD-003 はランタイムが複数ありうると規定している。そのため「ホストとランタイムの時計が一致する」という前提は、所要時間の計算に暗黙に入り込んでいる。WSL2 の VM の時計は、ホストのスリープ・休止から復帰したあとにずれることがある。数分ずれていれば、実行中の所要時間は符号を保ったままその分だけ誤った値になる (負にならないので隠れない)。表示だけの値なので Critical や High ではないが、spec AC4 が言う「どれだけかかったか」を、ランタイムによって系統的に誤らせる。
- **推奨アクション** (どれか 1 つ。最小の修正は (a)):
  - (a) 最小案: AD-051 の Consequences、plan RK-03、research R-02 の書き方を「WSL」から「ランタイム (WSL ディストロ・docker endpoint のコンテナ) の時計」へ広げる。さらに「実行中の所要時間は、両方の時計の差だけ過去ログの値とずれる」と明記し、既知の限界として受け入れる
  - (b) 実行中の所要時間を 1 つの時計で計算する。たとえば renderer のストアが、表示用の `createdAt` とは別に、受け取った時刻 (ホストの時計) を renderer の中だけで持つ。それを `deriveTurns` の `endedAt` に使う。DTO は変えないので FR-005 にも反しない
- **根拠**: AD-003 (ランタイムは複数ありうる), AD-012 (docker endpoint), AD-051 Decision 2/3/5 と Consequences
- **scope 根拠**: 本 feature の data-model §1/§2 と AD-051 (proposed) の範囲内なので、本 PR で直せる

### [Medium] 実機の確認 (quickstart V-3) が、実行中の時刻を確かめるランタイムの種別を決めていない (M-002) (scope: feature)

- **観察**: `specs/017-ui-conversation-time-and-activity/quickstart.md:40` (V-3 の 4) は「新しいセッションを起動して 2 ターン送る」とだけ書き、ランタイムを指定していない。Windows ネイティブのランタイムで行えば、ホストとランタイムの時計は同じなので、M-001 の差は観測できない。単体と component のテストも、すべて単一の偽の時計を使う (tasks.md:25, :40, :44)
- **同種事象探索**: Grep `WSL|Docker|docker|ランタイム|時計` を quickstart.md / tasks.md に対して実行した。ランタイムの種別を指定した手順は 0 件
- **リスク/影響**: M-001 の差を検出できる経路が、テストにも実機の確認にも無い。AD-051 Confirmation が見るのも過去ログ 1 件だけである (`0051-…md:54`)
- **推奨アクション**: V-3 の 4 に「WSL ランタイムで 1 回 (docker endpoint があればそれでも 1 回)。実行中の所要時間と、終わってから過去ログで見た同じターンの所要時間の差を記録する」を足す。単体テストには、`deriveTurns` に始まりと終わりで異なる時計の値を与え、負なら null になることと、正の差がそのまま出ることを固定する 1 件を足す (M-001 を (a) で受け入れる場合でも、現象を記録として固定しておく)
- **根拠**: AD-003, AD-051 Confirmation
- **scope 根拠**: 本 feature の quickstart.md / tasks.md の範囲内

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `WSL\|Docker\|docker\|ランタイム\|時計` (quickstart.md / tasks.md) | 0 (ランタイムの種別を指定した確認) | 時計の言及は tasks.md:25, :34, :40, :44 にあるが、どれも単一の偽の時計 |
| M-002 | 同上 | 0 | quickstart.md:40 にランタイムの指定が無い |

## Verdict

- Critical: 0
- High: 0
- Medium: 2
- Low: 0
