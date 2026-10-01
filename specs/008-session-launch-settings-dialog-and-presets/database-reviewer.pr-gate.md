# database-reviewer Review: X-4 (pr-gate round 4)

**Run**: 2026-10-01
**Reviewer**: database-reviewer
**Spec**: specs/008-session-launch-settings-dialog-and-presets/spec.md
**Round**: 4

## 初回読了 viewpoint

- FR/SC:
  - FR-009: presets.json の永続化と退避。provider-store を同じ形にそろえるための比較対象として読んだ
  - FR-010: 資格情報の実体を持たない (器は変わっていない)
  - spec.md:316-322: read 側の規則、退避の通知の 2 つの形 (「ファイル全体 (parse 失敗 / 将来版)」)
- touched files に該当する charter / Confirmation:
  - AD-042 Decision 4 :55 (ファイル全体 = parse 失敗 / 将来版)
  - AD-042 Confirmation (provider-store の読み込みテスト)
  - Constitution Principle V
- A. 認可 / 認証 / secret 管理: 該当なし: Round 3 の修正は版の判定、root の形の判定、表示文言だけ。secret を置ける器は増えていない
- B. 入力検証 / injection / CSP / 暗号: 該当なし: security-reviewer の担当。今回の差分に入力検証の経路は無い
- C. 業務不変条件 / Charter drift: 該当なし: architecture-reviewer の担当
- D. Constitution / ADR drift: 該当なし: architecture-reviewer の担当。AD-042 :55 の「将来版」と実装が一致したことは G で確認した
- E. User Story / SC / AC / UX: 該当なし: po / ux-reviewer の担当。L-502 は「永続化の状態が表示と合っているか」の範囲だけ見た
- F. 命名 / module / lint hookup: 該当なし: convention-reviewer の担当
- G. optional reviewer 範囲: Critical:0 High:0 Medium:0 Low:2
- H. テスト / coverage / observability / regression: Critical:0 High:0 Medium:0 Low:0

## スコープ要約

Round 3 の修正 (M-501 / M-502 / L-502) だけを見た。読んだファイルは次のとおり。
- `provider-store.ts`
- `provider-store.test.ts:152-193`
- `provider-service.ts:114-259`
- `provider-service.test.ts:323-359`
- `useProviders.ts`
- `labels.ts:51-76`
- `ProviderScreen.test.tsx:131-155`

比較のために `preset-store.ts:80-179` も読んだ。SQL と migration は無いので、DB-7 は該当なし。依頼の 3 点の結論は次のとおり。

- **正常な providers.json を誤って退避しないか**: 退避しない。
  - `SCHEMA_VERSION` は数値リテラルの `1` である (provider-record.ts:44)。
  - 数値の 1 は provider-store.ts:104 (`> 1` が偽) と :108 (`!== 1` が偽) を抜ける。:115 は `providers` が配列なら抜ける。
  - JSON 上の `1.0` / `1e0` も `JSON.parse` で数値の 1 になるので、同じく通る。
  - save は常に `{ schemaVersion: SCHEMA_VERSION, providers: [...] }` を書く (:150)。アプリが書いたファイルが新しい判定に引っかかる経路は無い。
  - save → load の往復テスト (provider-store.test.ts:90-101 ほか) が、この経路を引き続き pin している。
- **preset-store と完全に同じ形か**: Round 3 で指摘した 3 つの分岐は、条件・順序・reasonKey・退避の有無まで同じである。
  - 配列の root (provider-store.ts:95 / preset-store.ts:107)
  - 版の判定 (:104-111 / :114-121)
  - 配列でない `providers` (:115-118 / :124-127)
  - ファイル全体で見ると違いが 2 つ残る。どちらも Round 3 の修正範囲外で、code-gate iter1 / iter2 の時点で system follow-up に回したものである。今回の修正で生じたずれではない。
    - (a) ENOENT 以外の読み取り失敗を空として扱う (provider-store.ts:82-85。preset-store.ts:85-97 は `read-failed`)
    - (b) save の失敗時に temp を消さない (provider-store.ts:158-159。preset-store.ts:169-178 は消す)
- **L-502 の再取得が失敗したとき**: `.catch(() => null)` (useProviders.ts:112-114) によって `remove-failed` の文言になる。例外は外に漏れない。
  - remove は先に `ensureLoaded()` を通る (provider-service.ts:251) ので、`loadIssues()` (:175-178) の時点で `loaded=true` が確定している。store を読み直す経路は無い。
  - したがって再取得が失敗するのは IPC 層が落ちた場合に限られる。
  - そのとき将来版のファイルなのに「一覧を更新してから、もう一度お試しください」と出る。ただし、上部の 1 行表示 (labels.ts:59「削除もできません」) は useProviderLoadIssues の結果として残っている。このずれは指摘にしない。

## 前回指摘の状態 (Round 3 から)

| ID | 状態 | 根拠 |
|---|---|---|
| M-501 | **resolved** | 3 点で確認した。<br>- provider-store.ts:104-111 は、数値で現行版より大きいときだけを `schema-version-unknown` にし、それ以外の不一致は `parse-failed` で退避する。:95 は配列の root を弾く。<br>- テスト: provider-store.test.ts:168-193 の it.each (版の欠落 / `"1"` / 0 / 配列の root)。`reasonKeys` が `['parse-failed']` と一致すること、`.bak` が原文と一致することを確かめている。<br>- provider-service.test.ts:347-354 で、parse-failed なら register が通り、将来版なら `store-newer-version` になることを pin している。AD-042 :55 と spec.md:318 の「将来版」とも一致した |
| M-502 | **resolved** | provider-store.ts:115-118 で `!Array.isArray(root.providers)` を `parse-failed` として退避する。テストは provider-store.test.ts:176-177 (オブジェクト / キー欠落) |
| L-502 | **resolved** | 3 点で確認した。<br>- useProviders.ts:112-115 で、storeNewerVersion によって `store-newer-version` と `remove-failed` を出し分ける。<br>- labels.ts:73 に `remove-failed` を足した。<br>- テストは ProviderScreen.test.tsx:131-155 (2 分岐)。IPC の型は変えていない (最小案) |
| L-301 | **unresolved** (範囲が縮んだ) | 退避の条件は provider-store.ts:143 / preset-store.ts:151 のままで変わっていない。<br>- ただし M-501 の修正で、版の欠落などのファイルは `parse-failed` になり、mutation が止まらなくなった。最初の save で原文が置き換わるので、`.bak` が増え続けるのは本当に将来版のファイルだけになった |
| L-302 | **unresolved** (scope: system) | provider-service.ts:216-217 / :245-246 / :256-257 は、in-memory を置き換えてから save している。serialize は 0 件 |

## Findings

新しい指摘は無い。繰越の 2 件だけを記録する。

### [Low] (繰越) 退避対象のレコードが元のファイルに残り続け、将来版のファイルでは起動のたびに `.bak` が増える (L-301) (scope: feature)

- **観察**: provider-store.ts:105-106 / :143、preset-store.ts:115-116 / :151。将来版のときは provider-service.ts:188 / :223 / :252 で mutation が止まるので、ファイルは書き換わらず、load のたびに `.bak` が 1 個増える。M-501 の修正で、対象は本当に将来版のファイルだけに縮んだ。
- **同種事象探索**: Grep `` \.bak` `` (src/main/infra/settings) で 3 件 (provider-store.ts:72 / preset-store.ts / folder-store.ts)
- **推奨アクション**: Round 1 と同じ。X-6 の退避 UI と同じ follow-up にまとめてよい。
- **根拠**: agent 定義 DB-3

### [Low] (繰越) provider-service の mutation が直列化されておらず、in-memory の置き換えが save より先にある (L-302) (scope: system)

- **観察**: provider-service.ts:216-217、:245-246、:256-257
- **同種事象探索**: Grep `serialize|queue` (src/main/app/provider-service.ts) で 0 件
- **推奨アクション**: Round 1 と同じ。X-3 から持ち越した構造なので、system follow-up として記録する。
- **根拠**: agent 定義 DB-4

## H. テスト / regression の補足

- Round 3 の 3 件を検出するテストは揃っている (前回指摘の表を参照)。修正前のコードに戻すと、それぞれ失敗する形になっている。
  - 版の欠落は、修正前は `schema-version-unknown` を返していたので、:189 の `toEqual(['parse-failed'])` で落ちる。
  - `providers` キーの欠落は、修正前は `backupPath=null` だったので、:190 で落ちる。
- 既存の正常な providers.json に対する regression は無いと判断した。根拠はスコープ要約の 1 点目のとおり。
- 欠けているテストが 2 つある。どちらも挙動はコード上で正しいので、指摘にはしない。
  - implementer の記録には「負の版」とあるが、provider-store.test.ts:168-178 に `schemaVersion: -1` のケースは無い。preset-store.test.ts:132 にはある。
  - L-502 で再取得が reject されたときの分岐 (useProviders.ts:114) のテストも無い。
- 観測点も改善した。M-501 の修正の後は、provider-service.ts:136-140 の warn に出る `schema-version-unknown` は本当に将来版のときだけになり、ログ上で破損と将来版を区別できるようになった。
- テストは私は実行していない。implementer の記録では、3 ファイル / 52 件が pass している。

## 同種事象探索 cascade summary

| 指摘 ID | Grep query | 該当件数 | path:line |
|---|---|---|---|
| L-301 | `` \.bak` `` (src/main/infra/settings) | 3 | provider-store.ts:72 / preset-store.ts / folder-store.ts |
| L-302 | `serialize\|queue` (provider-service.ts) | 0 | - |
| (確認) M-501 | `schemaVersion !== ` / `schemaVersion > ` (src/main/infra/settings) | provider と preset は同じ形。folder-store.ts:114 だけ旧来の判定のまま (system follow-up。touched files 外) | provider-store.ts:104,108 / preset-store.ts:114,118 / folder-store.ts:114 |

## Verdict

- Critical: 0
- High: 0
- Medium: 0
- Low: 2 (繰越の L-301 / L-302)
- Round inheritance: resolved from 3: 3 (M-501, M-502, L-502) / unresolved: 2 (L-301, L-302) / new: 0

関連ファイル:
- C:\dev\closta\src\main\infra\settings\provider-store.ts
- C:\dev\closta\src\main\infra\settings\provider-store.test.ts
- C:\dev\closta\src\main\infra\settings\preset-store.ts
- C:\dev\closta\src\main\infra\settings\provider-record.ts
- C:\dev\closta\src\main\infra\settings\folder-store.ts
- C:\dev\closta\src\main\app\provider-service.ts
- C:\dev\closta\src\main\app\provider-service.test.ts
- C:\dev\closta\src\renderer\src\features\provider\useProviders.ts
- C:\dev\closta\src\renderer\src\features\provider\labels.ts
- C:\dev\closta\src\renderer\src\features\provider\ProviderScreen.test.tsx
