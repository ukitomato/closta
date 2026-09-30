# database-reviewer Review: Provider 登録と到達可能性判定 (X-3)

**Run**: 2026-09-30 / **Gate**: code-gate (database track) / **Spec**: specs/007-provider-registration-and-reachability/spec.md

## Verdict
- Critical: 0 / High: 1 / Medium: 4 / Low: 1

## 初回読了 viewpoint
- A. 認可 / 認証 / secret 管理: 該当なし: security-reviewer SEC-1 owner (器は G で扱う)
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer owner
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer owner
- D. Constitution / ADR drift: 該当なし: Principle V は充足。ADR drift は architecture owner
- E. User Story / SC / AC / UX: 該当なし: po-reviewer owner
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer owner
- G. optional reviewer 範囲 (永続化スキーマ): Critical:0 High:1 Medium:3 Low:1
- H. テスト / coverage / observability / regression: Medium:1

## スコープ要約
provider domain 初 feature。`providers.json` (schemaVersion=1) への JSON 永続化を新設。SQLite/SQL migration は無し (I-1 送り)。**Principle V の核は充足** — `CredentialRef` 判別 union に平文メンバ無し、`api-key`/`oauth-token` は `secretRefKey` (safeStorage ciphertext) のみ。削除時の参照キー解放は inline ciphertext のため orphan なし。最大の指摘は **既存 `folder-store.ts` が持つデータ保全不変条件 (上書き前退避) を provider-store が落としている** 点。

## Findings

### [High] DB-H-001 — parse 失敗 / schemaVersion 不一致で退避せず空へ倒し、次の save() が復旧不能に上書きする (scope: feature)
- **観察**: `provider-store.ts:54-66` は JSON.parse 失敗・非オブジェクト root・`schemaVersion !== 1` のいずれでも `{profiles:[], skipped:1, reasonKeys:['invalid-record']}` を返すのみで **raw の退避 (backup) をしない**。`ProviderLoadResult` に `backupPath` 無し。`provider-service.ts:103` は `skipped`/`reasonKeys` を破棄。次の register/update/remove (`:174/202/212`) が欠落集合で元ファイルを atomic 上書き。
- **同種探索**: `infra/settings` の backup 実装は `folder-store.ts` のみ (provider-store は 0)。folder-store は同経路で必ず退避してから空を返す (folder-store.ts:97/114-124、FR-019)。
- **影響**: 単一バイト破損 or v2→v1 ダウングレードのいずれでも、次の 1 件登録で既存全 Provider が黙って永久消失。**Critical にしない根拠**: 本 feature が最初の書き手で「今失われる既存データ」がまだ無いため観察事実バー未達。ただし Provider 蓄積後は現行コードで到達する実経路であり、既存安全パターンからの明確な退行。
- **推奨**: folder-store と同じく (1) 各分岐で上書き前 `backup(raw)` + `backupPath` 返却、(2) `ProviderLoadResult` に `backupPath` 追加、(3) service で `skipped>0`/`backupPath!==null` を保持し save 前に surface。
- **根拠**: DB-4 / DB-3 / Principle V 隣接の設定保全 / folder-store FR-019

### [Medium] DB-M-001 — schemaVersion 不一致と破損を同一 reasonKey に潰し、移行 seam も前方互換も無い
- **観察**: `provider-store.ts:57/60/65` は parse 失敗・非オブジェクト・version 不一致がすべて `'invalid-record'`。folder-store は `parse-failed`/`schema-version-unknown`/`invalid-record` を区別。`provider-record.ts:140-142` は未知キー 1 つで invalid reject の厳格スキーマ。
- **影響**: 呼び出し側が「新版なので上書きするな」を判別不能。`schemaVersion !== 1` は即全件破棄で forward migration seam 皆無。additive field を version 据置で足すと旧 client で全レコード invalid 化。
- **推奨**: reasonKey を version-skew/parse-failed/invalid-record に分離し version-skew を H-001 の退避+非上書き分岐へ接続。additive を許すなら未知キーは reject でなく無視 or 移行関数 seam。

### [Medium] DB-M-002 — extraEnv が無制約 `Record<string,string>` 袋で平文秘密が構造上入りうる
- **観察**: `types.ts:82` `extraEnv?: Record<string,string>`。`provider-record.ts:159-175` はキー長/制御文字・値長のみ検証。秘密/非秘密の型区別が無く、区別は実行時ヒューリスティック `scanExtraEnvForSecrets` のみに依存 (secret-scan.ts 自身が best-effort と明記)。
- **影響**: 接頭辞・40桁 blob に一致しない秘密 (短い社内トークン/記号入りパスワード) は器に平文で焼き込まれる。**High 上限根拠**: FR-004 値スキャン + FR-009 KEY denylist の多層防御が設計済み。網羅性 (flow) は security-reviewer owner。
- **推奨**: (a) extraEnv キーを documented allowlist 型に絞る、または (b) 型/コメントで「extraEnv は best-effort、秘密の正規経路は api-key/oauth-token」を明文化し設計判断として固定。

### [Medium] DB-M-003 — 固定 temp ファイル名の共有 + write-lock/fsync 無しで並行 save() が競合しうる
- **観察**: `provider-store.ts:22/101-103` は全 save が同一 `providers.json.tmp` へ writeFile→rename。lock も fsync も無い。service は in-memory full set を各 mutation で save。
- **影響**: register 短時間 2 連打等で async handler が interleave すると 2 つの save が同一 temp へ並行書き込み→内容混在→破損 temp を rename。次回 load で H-001 の全件破棄に合流。single-thread 主導で確率は低いが構造的に競合を許す。
- **推奨**: temp 名を一意化 (pid/乱数/カウンタ) or save を直列化する mutex。

### [Medium] DB-M-004 — データ喪失経路 (parse 失敗/version 不一致/退避) の回帰テストが無い
- **観察**: `provider-store.test.ts` は 5 ケース (roundtrip/空/複数 backend/extraEnv 秘密 skip/平文非混入) のみ。parse 失敗・schemaVersion 不一致・退避有無・skipped>0 が次 save で喪失に至らないことのテストが 0。folder-store.test.ts は `parse-failed`/`schema-version-unknown`/backup を明示 assert。
- **推奨**: 破損 JSON・非オブジェクト root・schemaVersion=2 の各入力で「退避が作られ元データが上書きされない」ことを folder-store.test.ts 同水準で assert。

### [Low] DB-L-001 — rename 前の fsync が無く電源断で truncated JSON が残りうる (scope: system)
- **観察**: `provider-store.ts:102-103` は writeFile 後 fsync せず rename。`infra/settings` 全体で fsync 0 件 (folder-store.ts:167-168 も同様)。
- **影響**: temp の flush 前電源断で 0 長/truncated が残り次回 load で全件破棄に合流。Windows enterprise (Defender/Tanium I/O hook) では非現実的でない。
- **推奨**: writeFile 後 fd.sync() してから rename。folder-store 含む横断課題のため system scope。

## caller Q への回答 (補足)
- Q2 (置き場): 平文秘密カラム無し。`secretRefKey` は ciphertext で Principle V ✓Good と一致。safeStorage 不可時 seal=null→登録拒否も確認。器懸念は extraEnv (M-002) のみ。
- Q3 (複数登録/削除解放): id 一意性は load 時 dedup。**register 時の衝突チェックは無く newId() 非衝突に依存** (provider-service.ts:164。注入のため実害低・Low 未満注意点)。削除時解放は inline ciphertext で orphan なし。
- DB-6 (パス名前空間): configDir は `{namespace,value}` 永続で表現済み。指摘なし。
- DB-7 (SQL): 該当なし (SQLite は I-1 送り)。
