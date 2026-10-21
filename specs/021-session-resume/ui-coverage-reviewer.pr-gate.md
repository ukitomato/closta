# ui-coverage-reviewer Review: セッションの再開 (resume) (X-9)

**Run**: 2026-10-22
**Reviewer**: ui-coverage-reviewer
**Spec**: specs/021-session-resume/spec.md
**Round**: 1

## 初回読了 viewpoint

- FR/SC: FR-016 (ui-coverage の Message branches から resume を外す)、FR-012 / FR-013 (それまでの会話の表示と読み取り失敗の 1 行)、FR-017 / SC-009 (`resume-failed` による fail closed)、FR-003 (会話の id の運び方)、FR-001 / FR-002 / FR-009 (「再開」「やり直す」の出し分け)、SC-004 / SC-007
- touched files に該当する charter / Confirmation: `docs/ui-coverage.md` の 2 hunk (Edit message の備考と Message branches の備考)。`docs/roadmap.md` の X-9 の行の結論。AD-044 (割当の 3 種類・Tier・M3 の完了の条件) には「Tier A の `後続` の行のうち割当先が M3 の feature の行が 0」とある。この PR は X-9 を割当先にした行を作っておらず、`後続: X-9` の行は 0 件。AD-047 Decision 1 (理由キー 18) は AD-059 Decision 3 が 19 に読み替える。
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer の範囲。本 reviewer は扱わない
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の範囲。本 reviewer は扱わない
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の範囲
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の範囲。Principle XII の判断のうち対応表の行ごとの判断は G で扱った
- E. User Story / SC / AC / UX: 該当なし: po-reviewer の範囲
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の範囲
- G. optional reviewer 範囲 (SDK の emit と表示の対応表): Critical:0 High:0 Medium:1 Low:2
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0 (`labels.test.ts:54,79-82` が `resume-failed` の網羅・再ログインの導線なし・文言を固定している。項目 21 は code-gate で pass。ui-coverage の行の備考はテストの対象外で、M-001 は検出手段がない種類の drift。観測点は AD-059 の `resume-failed` と `[session] conversation-id-changed` で足りる)

## スコープ要約

X-9 は過去・終了済み・失敗した行の再開 (resume) を作る。新しく表示に出る SDK 由来の情報は 3 つで、`LaunchFailureReason` の `resume-failed` (FailureBanner と行の短い理由)、再開したセッションの先頭に入れる過去の会話、境目の「ここから再開」の行。このほか、再開の起動の最初の `system/init` から読むフィールドが増える。`session_id` は main に運ぶだけで表示しない。`permissionMode` は fail closed の判定に使う。`docs/ui-coverage.md` の変更は 2 か所だけ (Message branches の備考から `resume (X-9)` を外した。Edit message の備考を `fork と合わせて X-6` に直した)。どちらも FR-016 のとおりで、`resume` を含む行は SDKUserMessageReplay の 1 行だけになった。行の追加・削除・Tier の変更・割当の書き換え・SDK の版の変更はない。

UC-1 から UC-7 の結論:

- **UC-1**: 新しい SDK のメッセージ型は描いていないので行の追加は不要。割当が `実装済み` に直る行もない。過去の会話は既存の A 節 assistant / user の行 (経路は両方) の表示を使い、区切りと読み取り失敗は既存の SystemEventRow (category `informational`) で出す (`running-session-store.ts:186-228`)。新しい element の使用はなく、F 節の使用箇所の列挙にも漏れはない (`LivePane.tsx` の EmptyState と GenerationLoader は既に列挙済み)。M-001 の `resume-failed` の備考は例外。
- **UC-2**: 該当なし。diff に `package.json` / `pnpm-lock.yaml` の変更がなく、SDK の版は 0.3.270 のまま。
- **UC-3**: `SDKUserMessageReplay` の `表示不要: resume 時の再送。元の user メッセージを表示している` は妥当。agents は `user` の本文を送らず (`sdk-agent-session.ts:858-864`)、`isReplay` の分岐もない。過去の会話は FR-012 の読み取りだけで出る。この行の理由は X-9 でかえって実体を持った。
- **UC-4**: 該当なし。Tier の変更が diff にない。
- **UC-5**: 該当なし。X-9 を `後続` の持ち主にした行がない (`後続: X-9` は 0 件)。Message branches の `resume (X-9)` は `未使用` の備考で `後続` の割当ではなかった。X-6 の行 (roadmap:355) は `後続: X-6` の 4 行 (`set_permission_mode` / `set_model` / `set_max_thinking_tokens` / `rename_session`) の持ち主の記述を保っている。resume と /clear の後の会話の id の分担も X-6 と X-9 の行で食い違っていない。
- **UC-6**: 該当なし。他 domain の値を行にしておらず、SDK の emit を他 domain の画面と称して外した行もない。再開の操作 (過去の行の帯・稼働中の行の「再開」「やり直す」・再開の形のダイアログ) は session の操作 UI なので行の対象外 (F 節の Thread list と同じ扱い)。
- **UC-7**: 該当なし。spec の status は `reviewing` で、この feature に割り当てた `後続` の行は 0 件。M3 の完了も主張していない (roadmap の X-9 の行に「M3 の完了の条件に数えない」とある)。

## Findings

### [Medium] D 節 `launch-failure` の備考が理由キー 18 のまま。X-9 で 19 になり、新しい `resume-failed` の言及がない (M-001) (scope: feature)

- **観察**: `docs/ui-coverage.md:176` は `O-4 で理由のキーが 18 になった (10 → 18。…)` と書く。X-9 は `LaunchFailureReason` に `resume-failed` を足して 19 にした (AD-059 Decision 3、`labels.ts:59,155`、`labels.test.ts:79-82`)。この理由は FailureBanner と監視ビューの行の短い理由・読み上げに出るので、割当の `実装済み: FailureBanner` は引き続き正しい。直っていないのは、数と、「再ログインの導線は `auth-failed` と `provider-error` だけ」の並びに `resume-failed` が出ないこと。
- **同種事象探索**: `Grep "理由のキー(が|は)? ?\d+|18 種" docs/ui-coverage.md` で 1 件 (`docs/ui-coverage.md:176`)。ほかに理由キーの数を書いた行はない。
- **リスク/影響**: 割当が矛盾しているわけではないので、隠れた Tier A はない。ただし D 節は機械照合の外 (凡例) なので、備考の数と範囲は人が直さない限り古いままになる。次に理由キーを足す feature が、この数字を根拠に判断しかねない。
- **推奨アクション**: 備考に「X-9 で 19 (`resume-failed`: 再開の起動が `init` の前に終わった・再開の最初の `init` が安全 3 値の外の権限モードを報告した。再ログインの導線なし。AD-059 Decision 3)」を足す。
- **根拠**: Constitution Principle XII、AD-044 (行の備考の更新)。
- **scope 根拠**: `docs/ui-coverage.md` は touched files。

### [Low] A 節 `SDKSystemMessage` (init) の備考の「他のフィールドは読まない」が X-9 の読み方と合わない (L-001) (scope: feature)

- **観察**: `docs/ui-coverage.md:50` は `permissionMode` を「O-4 が権限モードの比較に使う (… 他のフィールドは読まない)」と書く。X-9 は再開の最初の `init` で `permissionMode` を fail closed の判定に使い (`sdk-agent-session.ts:890-898`)、`session_id` を UUID の形で検査して `conversation` として main に運ぶ (`sdk-agent-session.ts:900-904`)。どちらも表示ではないので Tier B の割当は変わらない。備考の「読むフィールド」の列挙が古くなっているだけ。
- **同種事象探索**: `Grep "session_id|session id" docs/ui-coverage.md` で 0 件。`conversation_reset` の行 (`docs/ui-coverage.md:84`) に `new_conversation_id` の言及が 1 件ある (L-002 を参照)。
- **推奨アクション**: 備考に「X-9: 再開の最初の `init` の `permissionMode` を安全 3 値の検査に使い (FR-017)、`session_id` を会話の id として main に運ぶ (表示しない。AD-059)」を足す。
- **根拠**: AD-044 (備考の写し)。Principle XII (読む・運ぶフィールドを追える状態にする)。

### [Low] A 節 `SDKConversationResetMessage` の備考が、X-9 の「再開は最初の `session_id` を使う」との関係を書いていない (L-002) (scope: feature)

- **観察**: `docs/ui-coverage.md:84` は `new_conversation_id` を読まず X-6 に申し送ると書く。X-9 は /clear の後でも起動で最初に受けた `session_id` を使うので、/clear の前の会話が再開される (spec.md Edge Cases、roadmap の X-9 / X-6 の行に記載あり)。利用者は「ここから新しい会話です」の境界を見たのに、再開すると境界の前の会話に戻る。X-6 の行 (roadmap:355) は /clear の後の会話の id の扱いを受けているので持ち主の欠落ではない。対応表の備考がそのつながりを書いていないだけ。
- **同種事象探索**: `Grep "new_conversation_id|conversation_reset" docs/ui-coverage.md` で 1 件 (`docs/ui-coverage.md:84`)。
- **推奨アクション**: 備考に「X-9 の再開は起動で最初の `session_id` を使う (/clear の後の会話は再開されない。X-6)」と 1 句足す。
- **根拠**: Principle XII (利用者が判断を誤りうる境界の情報)、AD-028 §5 (申し送りは持ち主がわかる形で)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| M-001 | `理由のキー(が|は)? ?\d+|18 種` | 1 | docs/ui-coverage.md:176 |
| L-001 | `session_id|session id` | 0 | (なし。関連: docs/ui-coverage.md:50, 84) |
| L-002 | `new_conversation_id|conversation_reset` | 1 | docs/ui-coverage.md:84 |

(Critical の申告はなく、cascade の強制対象はない。)

## Verdict

- Critical: 0
- High: 0
- Medium: 1
- Low: 2
- Round inheritance: new: 3 (Round 1)
