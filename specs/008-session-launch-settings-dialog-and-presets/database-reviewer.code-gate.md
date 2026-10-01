# database-reviewer Review: X-4 (code-gate iter3)

**Run**: 2026-09-30
**Reviewer**: database-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 3

## 初回読了 viewpoint

- FR/SC: FR-009 (preset の保存・一覧・削除、JSON 永続、上書き前の退避) / FR-010 (資格情報の実体を持たない) / FR-011 / spec Assumptions (退避と read-failed をログに出す。UI 通知は X-6) / SC-003・SC-004
- touched files に該当する charter / Confirmation: AD-042:46-48 (schemaVersion の規則、ダウングレード非サポート) / Constitution Principle V
- A. 認可 / 認証 / secret 管理: 該当なし: 値の流れは security-reviewer SEC-1 の owner。器 (DB-1) は再確認した。今回追加した `errorCode` (preset-store.ts:34,50-53) は errno の形 `/^[A-Z][A-Z0-9_]*$/` に絞られていて、パスもメッセージも入らない
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の owner
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の owner
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の owner
- E. User Story / SC / AC / UX: 該当なし: po-reviewer / ux-reviewer の owner。L-202 の表示面は ux 側と重なる
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の owner
- G. optional reviewer 範囲: Critical:0 High:0 Medium:0 Low:2
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:1

## スコープ要約

iter2 の 3 件の修正を確かめた。対象は次の 4 つ。
- `preset-store.ts`: `errorCode` の追加、schemaVersion 判定の分割、rename が失敗したときの rm、fs の注入
- `preset-service.ts`: read-failed のとき list を reject する。warn を出す
- 両方のテスト
- renderer 側の `usePresets.ts` / `PresetPanel.tsx` / `labels.ts` (受け手として読んだ)

SQL / migration は無いので DB-7 は該当なし。preset はパスを持たないので DB-6 も該当なし。3 件とも意図どおり入っている。新しく見つかったのは Low 2 件。rm の失敗が元の error を上書きすること (L-201) と、read-failed から回復した直後の保存で name-conflict が表示されないこと (L-202)。

## 前回指摘の状態

| ID | 状態 | 根拠 |
|---|---|---|
| M-101 | **resolved** | 3 点を確かめた。(1) preset-service.ts:88 は read-failed のとき list を reject し、message は固定文字列。renderer は usePresets.ts:34 の `failed=true` から PresetPanel.tsx:65-68 の `presetsLoadFailed` 表示に乗る。(2) preset-store.ts:82-92 で errno コードを保持し、preset-service.ts:66 で `code=<code>` だけを warn に出す。(3) テストは preset-service.test.ts:122-177 と preset-store.test.ts:82 |
| L-101 | **resolved** | preset-store.ts:109 で「将来版」にするのは、数値で、かつ現行版より大きいときだけになった。:113 はそれ以外で一致しないものを parse-failed として退避する。テストは preset-store.test.ts:125-144 の 5 形。provider-store / folder-store は system follow-up のまま |
| L-102 | **resolved** (成功と失敗の主経路) | preset-store.ts:165-171。テストは preset-store.test.ts:199-206。残った縁の経路は L-201 に分けた |
| L-001 | **open** (X-6 へ繰越済み) | 変更なし |

### 依頼された確認点の結果

- **reject 化で remove / save の挙動が変わったか**
  - save は preset-service.ts:96 で従来どおり `store-read-failed` を返し、reject しない。
  - remove は、IPC では session-ipc.ts:179 の `presetIds()` が composition-root.ts:328 経由で `list()` を呼ぶ。そのため read-failed の間は `{ok:false}` ではなく reject になる。ただし read-failed になりうるのは最初の読み込みが成功する前だけである (`loaded` は一度立つと戻らない。preset-service.ts:61,74)。その間 renderer は `presets=null` かつ `failed=true` なので削除ボタンを描画しない (PresetPanel.tsx:65-91)。したがって現時点で届く経路はない。
  - service を直接呼ぶ remove は `{ok:false}` のまま (preset-service.test.ts:118)。
- **errorCode の値**: 形を検査しているので、文字列でないものや message の混入は落ちる。Windows の libuv が出す `UNKNOWN` や Node の `ERR_*` も通るが、どちらも固定の識別子なので漏洩はない。形が合わないコードを落とすテストは無い (Low 未満のため指摘しない)。
- **L-101 で正常なファイルを誤って退避しないか**: save が書くのは常に数値の `PRESET_SCHEMA_VERSION` である (preset-store.ts:158)。そのため :109 にも :113 にも当たらない。preset は本 feature の新規ファイルなので、旧版のアプリが別の形で書いたファイルは存在しない。`NaN` はそもそも JSON に出ない。`1.5` や `1e999` (Infinity) は将来版の扱いになり、安全側に倒れる。
- **注入した fs の既定値**: `DEFAULT_FS = { rename }` (preset-store.ts:47)。`node:fs/promises` の rename は `this` に依存しないので、そのまま渡してよい。composition-root の呼び出しは変わっていない。
- **rm が失敗したとき**: L-201 を参照。

## Findings

### [Low] rm が失敗すると、元の rename の error が rm の error で上書きされる。writeFile(temp) の失敗では一時ファイルが残る (L-201) (scope: feature)

- **観察**:
  - C:\dev\closta\src\main\infra\settings\preset-store.ts:169 の `await rm(temp.value, { force: true })` は try/catch の外にある。`force: true` が無視するのは ENOENT だけである。
  - rename を EPERM / EBUSY にする原因 (Defender / インデクサがファイルを掴んでいる) は、同じ一時ファイルに対する rm も EPERM / EBUSY にしうる。そのとき :170 の `throw error` には届かず、rm の error が呼び出し側に伝わる。元の rename の errno は失われ、一時ファイルも残る。
  - :164 の `writeFile(temp)` は try の外にある。ENOSPC などで途中まで書いて失敗すると、中途半端な `.tmp` が残る。
- **同種事象探索**: Grep `await rm\(temp` (src/main/infra/settings) で 1 件 (preset-store.ts:169)。provider-store / folder-store には rm の処理自体が無い (iter2 の cascade と同じ)
- **リスク/影響**: データは失われない。rename の前なので presets.json は無傷。影響は 2 つ。障害を調べるときに本当の原因 (rename の errno) が見えない。まれに `.tmp` が残る。
- **推奨アクション**: `await rm(temp.value, { force: true }).catch(() => undefined)` として、元の error を必ず rethrow する。writeFile も同じ try に入れる (try の範囲を `writeFile` + `rename` にする)。テストでは rm も注入可能にし、rm が reject しても `rejects.toBe(failure)` になることを確かめる。
- **根拠**: agent 定義 DB-4 / reviewer-base H (障害時の観測点)
- **scope 根拠**: preset-store.ts は本 feature の新規ファイル

### [Low] read-failed から回復した直後に既存と同じ名前で保存すると、name-conflict の確認が表示されず、何も起きない (L-202) (scope: feature)

- **観察**:
  - read-failed の間、renderer は `presets=null` になり、PresetPanel.tsx:37 で `[]` として扱う。そのため :39 の `duplicate` は false になる。
  - 保存フォームは failed のときも描画される (:93-114)。一時的な EBUSY が解消した後に既存と同じ名前で保存すると、service は読み直しに成功し、`name-conflict` を返す (preset-service.ts:101-103)。
  - PresetPanel.tsx:50-53 は `confirmOverwrite=true` と `message=null` を設定する。ところが :121 の表示条件 `confirmOverwrite && duplicate` が false なので、確認は出ない。
  - usePresets.ts:44 は ok のときしか `load()` し直さないので、一覧も「読み込めませんでした」のまま残る。
  - 新しい名前で保存したときは ok → `load()` と進み、回復する。
- **同種事象探索**: Grep `if \(result\.ok\) load\(\)` (src/renderer/src/features/session) で 2 件 (usePresets.ts:44, :53)
- **リスク/影響**: データは失われない。ただし M-101 の修正で入った「回復は開き直すまで待つ」状態では、利用者の操作が黙って無視される経路が残る。implementer の action log にも、同じマウントのまま回復する導線は足していないと明記されている。
- **推奨アクション**: 最小案は usePresets の save / remove で、結果にかかわらず `failed` のときに `load()` し直すこと。または `name-conflict` のときも `load()` する。表示の判断は ux-reviewer に委ねる。
- **根拠**: agent 定義 DB-4 (初期化に倒れて見えない) / reviewer-base H
- **scope 根拠**: usePresets.ts / PresetPanel.tsx は本 feature の新規ファイル

## H. テスト / regression の補足 (指摘外の根拠)

- 既存の正常経路は壊れていない。round trip、将来版の退避、invalid-record、上限、tmp の残りは、preset-store.test.ts:112-197 がそのまま通っている (action log の phase_b より 182 tests pass。私は実行していない)。
- rm が失敗する経路と writeFile(temp) が失敗する経路のテストは無い (L-201 の推奨に含めた)。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-201 | `await rm\(temp` (src/main/infra/settings) | 1 | src/main/infra/settings/preset-store.ts:169 |
| L-202 | `if \(result\.ok\) load\(\)` (src/renderer/src/features/session) | 2 | src/renderer/src/features/session/usePresets.ts:44, :53 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 3 (新規の L-201 と L-202、繰越済みの L-001)
- Round inheritance: resolved from 2: 3 (M-101, L-101, L-102) / unresolved: 1 (L-001 は X-6 へ繰越済み) / new: 2 (L-201, L-202)

関連ファイル:
- C:\dev\closta\src\main\infra\settings\preset-store.ts
- C:\dev\closta\src\main\infra\settings\preset-store.test.ts
- C:\dev\closta\src\main\app\preset-service.ts
- C:\dev\closta\src\main\app\preset-service.test.ts
- C:\dev\closta\src\main\app\composition-root.ts
- C:\dev\closta\src\main\app\session-ipc.ts
- C:\dev\closta\src\renderer\src\features\session\usePresets.ts
- C:\dev\closta\src\renderer\src\features\session\PresetPanel.tsx
- C:\dev\closta\src\renderer\src\features\session\labels.ts
