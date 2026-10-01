---
status: accepted
date: 2026-09-30
readopted: 2026-10-01
id: AD-042
deciders: ukitomato
tags: [provider, session, types]
supersedes: []
superseded-by: []
---

# AD-042: AD-005 の型精緻化と AD-039 D4 の失効を記録する

## Context

X-3 の pr-gate Round 2 (D-L-101 / D-L-102) で、2 つの follow-up が残された。

- [AD-005](0005-provider-as-registrable-value.md) の型が、実装で精緻化された。
- [AD-039](0039-credential-delegation-verified.md) D4 が、R-02 によって事実上失効した。

accepted の ADR 本文は immutable である。そのため、この 2 点は spec / data-model / glossary にしか記録されていない（roadmap X-3 行の follow-up ポインタ）。

X-4 は、同じ型にさらにフィールドを足す。あわせて、AD-039 調査結果 §3 の env-passthrough の記述が事実と合わないことも分かった（[AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (e)）。

**採択の経緯**: 2026-09-30 に採択し、2026-10-01 に決定者が再採択した。再採択の理由は、実装の code-gate と pr-gate (Round 1・2) の指摘を受けて Decision 4 を補ったことにある。補った内容は、schemaVersion の規則、ダウングレードの扱い、退避の通知である。本 ADR は main に入る前なので、補足は本文に畳み込んだ。

## Decision

1. **AD-005 の型精緻化を記録する。**
   - X-3 で入ったもの:
     - `ProviderProfile.credential` は `CredentialRef`（9 種の `CredentialSource` の判別共用体）である。
     - `configDir` は `HostPath | WslUncPath` である。
   - X-4 で足すもの:
     - `ModelEntry.supportedEffortLevels?: readonly EffortLevel[]`（手入力の静的データ。起動前の effort の選択肢の正本）
     - `ResolvedCredential.helperRuntimePath?: RuntimePath`。helper 系 3 方式で共通に使い、`awsCredentialExportPath?: string` を置き換える。分類は `classifyHelperPath` の 1 関数で行う。
     - `ResolvedCredential.passthroughValues?`。env-passthrough の値で、infra がアプリの process.env から取る。
     - `DerivedLaunchEnv.forwardKeys`。WSL へ転送するキー（AD-041 (e)）。
2. **AD-039 D4 は失効した。**
   - D4 は「aws-assume-role ではアプリが一時資格を扱う唯一の例外」とする決定だった。
   - X-3 R-02 で aws-assume-role は `awsCredentialExport` による helper 委譲になり、アプリは一時資格の実体を持たなくなった。
   - アプリが helper を生成する（RoleSessionName を埋める）件は、X-7 に繰り越す。
3. **AD-039 調査結果 §3 の「env-passthrough は秘密なし」を訂正する。**
   - env-passthrough の varNames の実体は、`ANTHROPIC_API_KEY` などの資格情報名である。
   - X-4 では、実名 allowlist の範囲で WSL へ転送する（AD-041 (e)）。
4. **既存レコードの互換方針を決める。**
   - X-4 は read 側の検証を強める。対象は次のとおり。
     - extraEnv の転送禁止キー (AD-041 (e) 3)
     - extraEnv のキー数の上限 32
     - varNames の allowlist
     - モデル ID の文字種
     - モデルカタログの root キー (`models` だけ)
   - これに反する既存の `providers.json` レコードは、X-3 の provider-store と同じく、退避したうえで `invalid-record` として読み込まない。
   - 初期の製品なので、移行処理は持たない。
   - **退避の通知**:
     - load で退避や skip が起きたら、件数・理由キー・退避パスをログに出す。値と名前は出さない。
     - ProviderScreen には 1 行だけ表示する。レコード単位なら「N 件の登録を読み込めませんでした」、ファイル全体 (parse 失敗 / 将来版) なら「保存ファイルを読み込めなかった」と出す。ファイル全体のときは件数を出さない。
     - 退避ファイルの一覧と復元の UI は X-6 で扱う。
   - `supportedEffortLevels` は任意フィールドの追加なので、`providers.json` の schemaVersion は 1 のまま据え置く。`presets.json` は X-4 で新設し、schemaVersion を 1 とする。
   - **ダウングレードはサポートしない。** X-4 が書いたファイルを旧版で開くと、旧版の検証が未知キーを拒否する場合、そのレコードは旧版の規則で退避され `invalid-record` になる。
   - **今後の規則**: 既存レコードが旧版の検証で拒否されるような変更 (必須キーの追加、enum の拡張、形の変更) を行う feature は、schemaVersion を上げ、版ごとの読み替え関数を store の内側に置く。X-6 (起動設定の軸の追加) と I-3 (権限モードの拡張) がこれに当たる。

## Consequences

- roadmap X-3 行の「後続 ADR 起票を要する」が閉じる。
- AD-005 と AD-039 の本文は変更しない。本 ADR が読み替えの正本になる。
- 退避の表示は、退避が起きた起動から、次に `providers.json` を書き換えて再起動するまでの間しか出ない。書き換えると不正レコードを含まない形で保存されるためである。それ以降の手がかりは `.bak` だけになるので、X-6 の退避 UI は `.bak` の列挙を正本にする。
- **残存リスク (helperPath の名前空間)**:
  - POSIX 絶対パスの `helperPath` は、所属 distro を持たない string として保存される (X-3 の `CredentialRef`)。`classifyHelperPath` はそれを**起動時に選んだランタイム**の RuntimePath として扱う。
  - そのため、distro A を想定して登録した helper が、distro B の同じパスにある別の実体として実行されうる。`configDir` (`HostPath | WslUncPath` を `isSameDistro` で照合) とは非対称である。
  - FR-014 が受け入れた形ではあるが、登録スキーマに所属 distro を持たせる変更を X-7 に繰り越す ([AD-041](0041-x4-launch-config-on-x1-launch-gate.md) (h))。

## Confirmation

- `src/domain/provider/types.ts` の型が、Decision 1 と一致する。
- provider-store の単体テストに「X-4 以前のレコード」が 1 ケースあり、次のどちらかであることを確認する。
  - 新しい規則に反するものは、退避されて `invalid-record` になる。
  - 反しないものは、そのまま読み込まれる。

## References

- [AD-005](0005-provider-as-registrable-value.md) / [AD-039](0039-credential-delegation-verified.md) / [AD-041](0041-x4-launch-config-on-x1-launch-gate.md)
- [spec 007](../../specs/007-provider-registration-and-reachability/spec.md) / [spec 008](../../specs/008-session-launch-settings-dialog-and-presets/spec.md)
