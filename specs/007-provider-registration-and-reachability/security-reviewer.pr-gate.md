# security-reviewer Review (pr-gate Round 3): Provider 登録と到達可能性判定 (X-3)

**Run**: 2026-09-30 / **Gate**: pr-gate / **Round**: 3 / **Spec**: specs/007-provider-registration-and-reachability/spec.md

## 初回読了 viewpoint
- A. 認可 / 認証 / secret 管理: Critical:0 High:0 Medium:1 Low:0
- B. 入力検証 / injection / CSP / 暗号: Critical:0 High:0 Medium:0 Low:1
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer 専任
- D. Constitution / ADR drift: 該当なし: architecture / platform-boundary 専任
- E. User Story / SC / AC / UX: 該当なし: po-reviewer 専任
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer 専任
- G. optional reviewer 範囲: 該当なし: database / a11y / ux 各 owner
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:1 Low:0

## Verdict
- Critical: 0 / High: 0 / Medium: 1 / Low: 1
- Round inheritance: resolved from R2: 1 (SEC-M-101 完全対称確認) / unresolved: 1 (SEC-L-101 → SEC-M-201 byte-vs-length 残余) / new: 1 (SEC-L-201)

## Round 2 finding 解決状態
- **SEC-M-101** (varNames 非対称) → **resolved**。write `isValidName(MAX_ID_LENGTH)` = read `isNonEmptyString(MAX_ID_LENGTH)` 述語・bound 一致。全 credential フィールドを照合し secret 経路以外に非対称なし。
- **SEC-L-101** (secret seal 長超過) → **部分修正 → SEC-M-201**。MAX_SECRET_PLAINTEXT_LENGTH は追加されたが `.length` (UTF-16) で測り UTF-8 バイトを縛れていない。

## Findings (new)
### [Medium] SEC-M-201 — 平文 secret を UTF-16 `.length` で縛り UTF-8 バイト長を縛らないため multibyte secret で secretRefKey が reload 上限超過→無言消失 (SEC-L-101 同一クラス残余)
- **観察**: write `validate.ts` は `c.secret.length <= 2048` (UTF-16 code unit)。seal は `safeStorage.encryptString` で UTF-8 バイト暗号化 + base64。CJK 2048 字 = 6144 バイト → base64 ≈8235 > 4096 で reload の `str(secretRefKey)` (≤4096) が弾き → 無言消失。`validation.ts` の「seal 後 secretRefKey が必ず 4096 未満」宣言が multibyte で偽。
- **推奨**: UTF-8 バイトで測る (`new TextEncoder().encode(x).length`。domain の既存 normalize.ts/validation.ts:197 と同型)。 → **[fixed] `MAX_SECRET_PLAINTEXT_BYTES=2048` + `TextEncoder().encode(secret).length` に変更。validate.test.ts に multibyte 負例 (`'あ'.repeat(1024)` 拒否) 追加。**
### [Low] SEC-L-201 — helperPath/profileName/region/extraEnv 値が write/read 両側で制御文字を許容 (両側対称で reload 非対称なし)。X-4 で helper spawn / AWS env 注入前に hasControlCharacter 拒否を追加すべき。現 X-3 は実行経路なし → **deferred (X-4。CWE-88)**。

## 健全確認
preload 最小公開 (単一 capability・raw ipcRenderer 非公開・汎用 invoke なし・contextIsolation 強制)、全 IPC の isTrustedSender + checkProviderDraft/Patch、Principle V (safeStorage 暗号化 base64・平文非永続・unavailable 拒否・secretRefKey 非 DTO)、AD-040 権限ゲート、deriveEnv fail-closed。**Critical/High=0。**
