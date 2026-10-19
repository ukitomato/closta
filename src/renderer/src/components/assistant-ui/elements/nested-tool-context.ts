import { createContext, type ReactNode } from "react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";

/**
 * Subagent の入れ子の中の tool-call を、主ループと同じ振り分けで描くための context (O-11 / FE-031 / data-model §3.3)。
 *
 * **依存の向きを守るために、`tool-registry.aui.tsx` と `subagent.aui.tsx` の両方がこのファイルを import する** (循環の禁止 /
 * AD-023 §7): `tool-registry.aui.tsx` が Agent / Task の表示の包みで Provider を置き (値は `ToolDisplay` で描く関数)、
 * `subagent.aui.tsx` が読む。`subagent.aui.tsx` は `tool-registry.aui.tsx` と `thread.aui.tsx` を import しない。
 * component ではなく関数で受ける (render の中で component を作らない)。
 */

/** 入れ子の tool-call を描く関数。既定値 `null` (registry の外) は今の簡易な描画。 */
export const NestedToolRendererContext = createContext<
  ((props: ToolCallMessagePartProps) => ReactNode) | null
>(null);

/** 入れ子の深さ (最上位の Subagent の外は 0)。入れ子の中の Subagent が自分の本文の深さを決めるために読む。 */
export const NestedDepthContext = createContext(0);
