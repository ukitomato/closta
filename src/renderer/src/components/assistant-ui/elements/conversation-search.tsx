"use client";

import type { ComponentProps, KeyboardEventHandler, Ref } from "react";
import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostButton, mono, paper } from "./surfaces";

/*
 * registry の `elements-conversation-search` から変えた点 (O-3 / spec 012 SH-003 / FE-024):
 * - スクロールバーの一致の印 (`SearchHit.position` と印の列) を外した。transcript は仮想化していて、
 *   描かれていない範囲の高さを知らないので印の位置を決められない (本文の並びの比で近似しない。research R-04)。
 * - 一致の前後の文 (`before` / `match` / `after`) の表示を外し、一致の一覧 (`hits` / `activeIndex`) の代わりに
 *   件数と位置の文 (`status`) を受ける。前後の文は 012 data-model §2 に無い。
 * - 英語の文言 (`Find in conversation` / `Previous match` / `Next match`) と件数の書式 (`i/n`) を `labels` / `status` で
 *   受ける (文言の表は features 側。AD-045 Decision 2)。位置の文は `role="status"` で読み上げる。
 * - 閉じるボタン (`onClose`) と、入力欄へフォーカスを移す口 (`inputRef`) と、入力欄のキーの口 (`onInputKeyDown`) を足した。
 *   Enter / Shift+Enter / Esc と IME の変換中のガードは外側 (`ConversationSearchProvider`) が持つ。
 * - 入力欄を `role="searchbox"` の text の欄にした (Chromium の search 欄は Esc で値を消すので、Esc の扱いを外側の 1 か所に
 *   する)。位置の文の色を読める濃さ (`text-muted-foreground`) にした。
 */
export interface ConversationSearchLabels {
  /** 入力欄の名前。 */
  input: string;
  placeholder: string;
  previous: string;
  next: string;
  close: string;
}

export function ConversationSearch({
  query,
  status,
  labels,
  onQueryChange,
  onStep,
  onClose,
  inputRef,
  onInputKeyDown,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "onKeyDown"
> & {
  query: string;
  /** 件数と位置の文 (例「2 / 5 件」)。空なら出さない。 */
  status: string;
  labels: ConversationSearchLabels;
  onQueryChange?: (query: string) => void;
  onStep?: (delta: number) => void;
  onClose?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  onInputKeyDown?: KeyboardEventHandler<HTMLInputElement>;
}) {
  return (
    <div
      data-slot="conversation-search"
      className={cn("flex w-full max-w-sm gap-2", className)}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div
          className={cn(
            paper,
            "flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3",
          )}
        >
          <SearchIcon
            aria-hidden
            className="text-foreground/30 size-3.5 shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            role="searchbox"
            value={query}
            onChange={(event) => onQueryChange?.(event.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={labels.placeholder}
            aria-label={labels.input}
            autoComplete="off"
            spellCheck={false}
            className="text-foreground/85 placeholder:text-foreground/30 min-w-0 flex-1 bg-transparent text-[13px] outline-none"
          />
          <span
            role="status"
            aria-live="polite"
            className={cn(mono, "text-muted-foreground shrink-0 tabular-nums")}
          >
            {status}
          </span>
          {onStep && (
            <>
              <button
                type="button"
                aria-label={labels.previous}
                title={labels.previous}
                onClick={() => onStep(-1)}
                className={cn(ghostButton, "size-6 shrink-0")}
              >
                <ChevronUpIcon aria-hidden className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label={labels.next}
                title={labels.next}
                onClick={() => onStep(1)}
                className={cn(ghostButton, "size-6 shrink-0")}
              >
                <ChevronDownIcon aria-hidden className="size-3.5" />
              </button>
            </>
          )}
          {onClose && (
            <button
              type="button"
              aria-label={labels.close}
              title={labels.close}
              onClick={onClose}
              className={cn(ghostButton, "size-6 shrink-0")}
            >
              <XIcon aria-hidden className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
