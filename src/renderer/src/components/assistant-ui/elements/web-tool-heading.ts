import { TOOL_DISPLAY_LABELS } from "@/features/chat/labels";

/** host の上限 (コードポイント)。 */
export const HOST_MAX = 256;

/**
 * WebFetch の見出し (O-6 / FE-021 / 016 data-model §2「WebFetch の見出しを host だけにする理由」)。
 *
 * WHATWG URL で読み、**http(s) のときだけ host**。読めない・http(s) でない (`javascript:` / `data:` / scheme の無い
 * `user:pass@host/p` など)・host が 256 コードポイント超は「URL」。パス・クエリ・資格情報・フラグメントは出さない
 * (パスの末尾が秘密の webhook があり、見出しは畳んでも見えるため。design-gate R2 H-01)。リンクにしない。
 * O-5 の `summarizeResourceUri` とは規則が違うので共有しない。
 */
export function webFetchHeading(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return TOOL_DISPLAY_LABELS.urlHeading;
    }
    const host = parsed.host;
    if (host === "" || Array.from(host).length > HOST_MAX) {
      return TOOL_DISPLAY_LABELS.urlHeading;
    }
    return host;
  } catch {
    return TOOL_DISPLAY_LABELS.urlHeading;
  }
}
