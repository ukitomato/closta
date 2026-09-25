# security-reviewer — design-gate (R-3) Round 2

**Run**: 2026-09-24 / read-only

## Verdict: Critical 0 / High 2 / Medium 3 / Low 2 (+ L-001 carried)

Round 1 resolved: 8 (C-001 normalize / H-001 XSS / H-002 sessionId / H-003 topology / H-004 tests / M-001 env / M-002 log)。unresolved: 0。new: 6 (S-001〜S-006)。

## High (new)

### S-001 — 取得プロセス↔renderer 直結 port の inbound 方向が未規定 / FR-005 と C-3 の文言が矛盾
- **Where**: contracts/transcript-read.md C-3 (port2 を renderer へ) vs spec.md FR-005 (renderer に取得プロセスへの transferable port を渡さない)。inbound 方向の取得プロセス挙動が未規定
- **Issue**: 本プロジェクト初の main 非仲介の直結チャネル。renderer が XSS 侵害された場合、直結 port 経由で取得プロセスへ制御メッセージを送り、main 側検証 (sessionId UUID / targetKey) を迂回して別 sessionId 取得を受けるハンドラを付ける余地。
- **Action**: (1) contract に「port2 は取得プロセス→renderer の**一方向データ送出専用**。取得プロセスは inbound port メッセージを受理しない (無視 or ack のみ)」を明記。(2) 取得プロセスは spawn 時固定の単一 sessionId のみ扱い port で対象変更不可を構造保証。(3) FR-005 の文言を「取得対象を指定/変更できる制御 port を渡さない (データ受信 port は main が宛先検証のうえ transfer)」に精緻化し C-3 と整合。(4) BE-022/BE-027 に inbound port で対象を変えられない negative test。CWE-862。

### S-002 — 画像 URL allowlist (http(s) 許可) が実 CSP `img-src 'self' data:` と不整合 (リモート画像ビーコン化余地)
- **Where**: data-model §7 (「http(s)/相対/data:」かつ「CSP img-src 'self' data: と整合」と自称) vs 実 CSP src/main/app/protocol.ts (http(s) 画像を許可していない)
- **Issue**: `![](https://attacker/track.png)` で利用者 IP/閲覧タイミングが漏れる tracking pixel。現 CSP が偶然ブロックするため実害は未成立 (High 止まり) だが、allowlist が CSP より緩い不整合が地雷。
- **Action**: (推奨最小案) data-model §7 の画像 allowlist を **`data:`(画像 MIME) + 相対のみに絞り http(s) リモート画像を除外** (実 CSP と一致)。リモート画像を許すなら privacy tradeoff を ADR で決定し CSP と両方変える。§7 の「CSP と整合」を実 CSP の綴りに合わせる。CWE-359 / FR-020。

## Medium (new)
- **S-003**: getTranscript が要求ごとに短命プロセス (~2.7s/~50MB) を spawn するが、同時実行上限・切替時の kill/cancel が未規定 → resource exhaustion (自機 DoS)。stale-token は表示を守るがプロセスは走り続ける。→ 切替で in-flight プロセスを kill、同時数の上限を実名定数で、状態遷移に「切替=旧 token 破棄 + 旧プロセス停止」を明記。CWE-400。
- **S-004**: URL allowlist の enforcement 点がタスク未割当 (BE-013 は制御文字のみ、FE-040 は仮想化、MarkdownText の既定 urlTransform 依存)。javascript: href 無害化の直接 test も無い (FE-034 は jsdom で navigation が走らず素通り)。→ enforcement を明示タスク化 (urlTransform/rehype-sanitize schema か domain 側 href 検査)、FE-034 に href 無害化 assertion、契約に enforcement 点 (モジュール名) を記す。CWE-79。
- **M-003 (Round 1 partial)**: 取得プロセスの spawn/port 失敗の観測点が FailureReason 区分以上に無い。→ 本文非 log と両立する範囲でライフサイクル観測点を最小定義 (S-003 と統合)。

## Low (new)
- **S-005**: 本文サニタイザの「危険な C0」集合と CR(0x0D) の扱いが実名未確定 (改行/タブ保持は明記)。→ data-model §6 に保持/除去する C0 を実名列挙、BE-014 で各コードポイント固定。CWE-176。
- **S-006**: 取得プロセスへ渡す最小 env allowlist が未列挙 (方針のみ)。→ C-2 に実名リスト (CLAUDE_CONFIG_DIR のみ等) を明記、BE-026 で親 env 非スプレッドを test。Principle V / CWE-200。
- L-001 (carried): CSP img-src data: の SVG は defense-in-depth 検討据え置き (Low)。

## 総括
Round 1 の Critical/High はすべて resolved。新 High 2 (S-001 直結 port inbound / S-002 画像 allowlist と CSP 不整合) は実コード未着ゆえ Critical 未満だが、実装前に contract で境界を精緻化すべき。
