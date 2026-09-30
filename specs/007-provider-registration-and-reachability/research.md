# Research: Provider 登録と到達可能性判定 (X-3)

**Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

前提 SPIKE-7 は完了済み ([AD-039](../../docs/decisions/0039-credential-delegation-verified.md))。本 feature 固有の
未確定を Phase 0 で解く。**新規 SPIKE は無い** (いずれも実装時の裏取り / 判断)。

## R-01: helper の live 実発火の裏取り

- **問い**: AD-039 は helper (`apiKeyHelper` / `awsCredentialExport`) の呼び出しタイミング・TTL を型 + 公式
  ドキュメントまでで判定した (live 未観測)。実発火回数・5 分 TTL を裏取りする。
- **手法**: stub helper (新鮮な値を stdout に出すだけのスクリプト) を per-session `HelperSettings` で渡し、
  発火回数・タイミングを 1 度観測する (AD-039 Open Question)。
- **合否外**: 実測は quickstart (SH-022) に記録。結果は AD-039 の裏取りとして残す。

## R-02: aws-assume-role を直接 AssumeRole するか awsCredentialExport 化するか

- **問い**: `aws-assume-role` の一時資格をアプリが期限監視 (AD-039 D4) するか、**一時資格を JSON 出力する helper
  スクリプト化 (`awsCredentialExport`)** して期限監視を Claude Code の cache-until-`Expiration` に寄せるか。
- **トレードオフ**:
  - **直接 AssumeRole**: アプリが `TempCredential` をメモリで持ち期限監視 (FR-013)。env に AWS_* を実名注入するが、
    **WSL ランタイムへ `WSLENV` 透過で届けない**方法 (下記) を要する。
  - **awsCredentialExport 化**: アプリは helper パスのみ持つ (秘密なし)。期限監視は Claude Code。ただし helper が
    STS を叩くスクリプトを吐く必要があり、資格情報チェーンの前提が要る。
- **WSL への届け方 (直接方式の場合)**: `Options.env` は subprocess (WSL 越し `claude`) の環境を置換するため、
  AWS_* は `env` で直接渡り `WSLENV` 透過を経由しない (X-1 の起動経路と同じ)。**`WSLENV` に AWS_* を載せない**ことを
  SC-003 で assert。→ この確認が取れれば直接方式で WSLENV 経路を作らずに届く。
- **決定 (2026-09-29 確定)**: **`awsCredentialExport` 化を採用する** (依存なし)。`aws-assume-role` は「STS AssumeRole を
  行い一時資格を JSON 出力する **helper スクリプト**」をアプリが用意し、そのパスを `settings.awsCredentialExport`
  (`HelperSettings`) で渡す。**期限監視は Claude Code の cache-until-`Expiration` に委譲**する。結果:
  - `@aws-sdk/client-sts` を**入れない** (R-03 の依存追加・depcruise 隔離ルールは不要になる)。
  - アプリは**一時資格の実体をメモリにも持たない** — 他 8 方式と同じく「helper パスのみ保持」に収束し、
    「アプリが一時資格を扱う唯一の例外」(AD-039 D4) が**消える** (charter Scope「一時資格情報の有効期限監視と警告」は
    Claude Code 委譲側へ寄る)。
  - **FR-006 / FR-013 / US-3 / SC-005 / SC-008 は N/A** になる (spec の分岐記述どおり)。`TempCredential` 型は不要。
  - 採用しなかった「直接 AssumeRole」の理由: 一時資格をアプリのメモリで扱う例外を作り、新規依存 (`@aws-sdk/client-sts`) と
    期限監視・RoleSessionName 実装をアプリに負わせる。awsCredentialExport 化はこれらを Claude Code 委譲に寄せ攻撃面を縮める。
  - **helper スクリプトが `AssumeRole` する際の `RoleSessionName` (アプリ名+セッション ID。CloudTrail 追跡) は
    helper スクリプト内で設定**する (AD-039 D4 の監査要件は helper 生成側で満たす)。AD-039 は immutable なので
    本 research + spec/data-model で決定を記録する (Open Question の決着。持ち主 = X-3)。

## R-03: AWS SDK (`@aws-sdk/client-sts`) 導入の是非と隔離

- **問い**: `aws-assume-role` 直接方式なら `@aws-sdk/client-sts` が新規 external 依存。bundle 増・postinstall・CVE。
- **隔離**: aws-sdk は純 JS (ネイティブでない) で platform 仮定を持ち込まない。**aws 境界 infra ファイル群のみ
  import 可**とする depcruise ルール (electron/native と同型の allowlist) を SH-001 の ADR で足す (M-09)。
  `src/agents/` から到達しない (Principle VII)。導入時に lockfile で postinstall 有無と CVE を点検 (Phase 0)。
- **R-02 で awsCredentialExport 化を採るなら本依存は不要**になりうる (採否と連動)。

## R-04: 検出の OS 差と I/O 境界の切り方 (Principle II)

- **問い**: config dir 候補・`~/.aws/config` の所在・env 走査の OS 依存を、`PLATFORM_BRANCH_DIRS` が
  `src/main/infra/runtime/` のみ許す制約 (H-04) の中でどこに置くか。
- **選択肢**: (a) base-path 解決 (`os.homedir()` 等) を **`infra/runtime` の能力**として提供し検出モジュールは値で受ける、
  (b) domain のパス API 経由で所在を得る、(c) `PLATFORM_BRANCH_DIRS` / eslint の `os`/`process` 許可を ADR 根拠付きで拡張。
- **方針**: (a)/(b) を優先し provider infra に platform 分岐を持ち込まない。どうしても要るなら (c) を SH-001 の ADR に含める。
  plan Constitution Check II を実態 (infra/runtime 限定) に精密化済み。

## R-05 (確認のみ): vertex / foundry は登録のみ

- charter どおり `vertex` (`gcpAuthRefresh`) / `foundry` は**登録のみ**で到達可能性判定・env 導出・helper 委譲の
  検証対象にしない (spec Out of Scope)。本 feature で発火しないことを確認して記録する。
