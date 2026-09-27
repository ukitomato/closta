/**
 * ディストロ内で実行する**唯一の**スクリプト (BE-026 / contracts/runtime-detection.md C-3)。
 *
 * **不変条件 (ADR レビューが担保する。機械検証されない)**:
 * - ディストロ内に**永続的な変更 (ファイル・パッケージ・OS 設定) を残さない**。
 *   プロセスの寿命で消える一時資源の生成 — user namespace の試験生成 — は許す
 * - **標準入力を読まない。** スクリプト自身が標準入力で渡されるため、
 *   標準入力を読むコマンドを含めるとスクリプト本体を食う
 *
 * **内容の変更には ADR を要する。** 定数と実行箇所を同じ PR で書き換えれば、
 * 永続的な変更を残すスクリプトが検証の全項目を通過する (contracts C-3)。
 * 一致検証が見るのは形であって意味ではない。
 *
 * ### 形の制約 (`scripts/constitution/check.mjs` 項目 6 が検査する)
 *
 * 1. **単一のリテラル**であること — 連結・テンプレート補間・関数生成で組み立てない
 * 2. 標準入力へ書く式が**この識別子そのもの**であること
 * 3. 各行が許可するコマンド形 (`DISTRO_SCRIPT_ALLOWED_FORMS`) に収まること
 *
 * ### なぜリダイレクトを 1 つも使わないか
 *
 * `2>/dev/null` のような**出力先の指定は許可形に含めない**。
 * 出力系コマンドとリダイレクトを組み合わせればディストロ内に永続的な変更を残せるため、
 * 「リダイレクトが 1 つでもある」形を許すと検証の意味が薄れる (R-08)。
 * 失敗時の既定値は `||` で与える。`command -v` は不在時に stderr へ何も書かない。
 *
 * ### `claude` 実行パスの解決 (X-1 / AD-036 / AD-018 §4)
 *
 * 起動 (X-1) は WSL 内 `claude` を**絶対パス**で起動する (`PATH` を渡さない。裸名依存を避ける。
 * data-model §8 L-102 / CWE-426)。実行パスは検出時に `command -v claude` で 1 回解決し
 * descriptor (`claudePath`) に載せる — 既存の probe 経路に相乗りし、`wsl.exe` の呼び出しを増やさない
 * (新規引数を要する launch-time 解決を避ける。allowlist 項目 2 / 7 を触らない)。不在時は空文字列を返し、
 * ホスト側は `claude-not-found` に倒す。**`command -v` は既存の許可形**であり項目 6 の形の制約に収まる。
 *
 * ### 出力の形
 *
 * `key=value` 行と、`mounts_begin` / `mounts_end` で囲んだマウント情報の生ブロック。
 * **整形はホスト側で行う** — スクリプトに含めるコマンドを最小に保つため (research R-02)。
 * 末尾の `done=1` が**完了の標識**である。これが無ければ判定失敗として扱う (C-5)。
 *
 * マウント情報を `/proc/mounts` から採るのは、`mount` コマンドを許可形に加えずに
 * 同じ情報 (マウントオプションの `path=`) を得られるためである (AD-015 §6)。
 * `/proc/mounts` は空白とバックスラッシュを 8 進表記 (`\040` / `\134`) で
 * エスケープするので、ホスト側で復号する。
 */
export const PROBE_SCRIPT = `printf 'bwrap=%s\\n' "$(command -v bwrap || printf '')"
printf 'socat=%s\\n' "$(command -v socat || printf '')"
printf 'claude=%s\\n' "$(command -v claude || printf '')"
printf 'userns_restrict_readable=%s\\n' "$(test -r /proc/sys/kernel/apparmor_restrict_unprivileged_userns && printf 'yes' || printf 'no')"
printf 'userns_restrict=%s\\n' "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns || printf '')"
printf 'userns_create=%s\\n' "$(unshare --user --map-root-user true && printf 'ok' || printf 'fail')"
printf 'mounts_begin=1\\n'
cat /proc/mounts
printf 'mounts_end=1\\n'
printf 'done=1\\n'
`
