# platform-boundary-reviewer Review: セッションの再開 (resume) (X-9)

**Run**: 2026-10-21
**Reviewer**: platform-boundary-reviewer
**Spec**: specs/021-session-resume/spec.md
**Gate**: code-gate (iter 1)

## 初回読了 viewpoint

- FR/SC: FR-001〜FR-017 / SC-002〜SC-009。PB 担当は FR-004 / FR-005 / FR-011 / FR-014 / FR-017
- touched files に該当する charter / Confirmation: session charter (Journey 4)、AD-059 Confirmation、AD-003、AD-004、Principle II / III / VII
- A. 認可 / 認証 / secret 管理: 該当なし: owner は security-reviewer
- B. 入力検証 / injection / CSP / 暗号: 該当なし: owner は security-reviewer
- C. 業務不変条件 / Charter drift: Critical:0 High:0 Medium:0 Low:1
- D. Constitution / ADR drift: Critical:0 High:0 Medium:0 Low:1
- E. User Story / SC / AC / UX: 該当なし: owner は po-reviewer
- F. 命名 / module / lint hookup: Critical:0 High:0 Medium:0 Low:0
- G. optional reviewer 範囲: 該当なし: optional reviewer の担当
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## PB 観点チェック

- PB-1 (パス型の消失): IPC を越えるのは不透明な targetKey / UUID / id のみ。例外は L-001 / L-003
- PB-2 (単一インスタンス仮定): 該当なし
- PB-3 (capabilities の虚偽表明): 楽観表示の経路は L-002
- PB-4 (権限ゲートの迂回): 該当なし (checkResumeRequest → checkLaunchConfig、prepareLaunch、decodeLaunchOptions、FR-017 fail closed)
- PB-5 (多段パス変換の欠落): 該当なし
- PB-6 (永続環境の構築): 該当なし
- PB-7 (lint ルールの網羅性): resume-service は .dependency-cruiser.js:254 と allowlists.mjs:427-428 に追加済み。該当なし

## Findings

### [Low] 稼働中の行の targetKey (序数入りの不透明な鍵) を列挙をまたいで持ち続ける (L-001) (scope: feature)
- 観察: src/main/app/resume-service.ts:122-123 が `record.targetKey ?? ...` で前の鍵を引き継ぎ、src/main/app/session-launch-service.ts:258 / :341 が退避の表に入れ直す。鍵は `${namespace}#${ordinal}` (src/domain/session/target.ts:41-42)
- リスク: ホームの候補が増減すると同じ鍵が別のホームを指す。結果は読み取りの失敗 (FR-013) で、別会話を読むことはまず無い
- 推奨: 再開を重ねるときは列挙のキャッシュで決め直すか、pastResumeSource で存在を確かめる
- 根拠: AD-004、PB-1

### [Low] WSL の既定ユーザでないホームの過去の行が「再開できる」と表示され起動後に resume-failed になる (L-002) (scope: feature)
- 観察: EnumerationTargetOrigin は 'default' のみ (src/domain/session/target.ts:16)。src/domain/session/resume-axes.ts:109-110
- リスク: 楽観側への倒れ。AD-059 Consequences で許容済み
- 推奨: 直さない。X-6 / I-3 で列挙対象に事実を持たせたら事前拒否
- 根拠: runtime charter、PB-3、AD-059 Consequences

### [Low] ConversationRecord.runtimeId / LaunchAxes.runtimeId を string で持ち as RuntimeNamespaceId でキャスト (L-003) (scope: feature)
- 観察: src/main/app/session-launch-service.ts:109 / :126 / :163、src/main/app/resume-service.ts:143
- 推奨: 検証時点の型 RuntimeNamespaceId で持つ
- 根拠: AD-004、PB-1

### [Low] (H) L-001 の列挙変更後の再開を確かめるテストが無い (L-004) (scope: feature)
- 観察: src/main/app/resume-service.test.ts:279 は引き継ぎのみ確認
- 推奨: L-001 を直すときに 1 件足す

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-001 | `targetKey: prevRecord?.targetKey\|record.targetKey ??` | 2 | src/main/app/session-launch-service.ts:258, src/main/app/resume-service.ts:123 |
| L-002 | `target.origin === 'default'` | 1 | src/domain/session/resume-axes.ts:109 |
| L-003 | `as RuntimeNamespaceId` (src/main/app) | 1 | src/main/app/resume-service.ts:143 |
| L-004 | `targetKey が引き継がれる` | 1 | src/main/app/resume-service.test.ts:279 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 4

Low はすべて AD-050 に従い、この gate では直さない。
