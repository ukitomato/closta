"use client";

import {
  useEffect,
  useId,
  useRef,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";
import { SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { field, floating, mono } from "./surfaces";

/*
 * registry の `elements-command-palette` から変えた点 (O-3 / spec 012 FE-031 / research R-04 の照合 (b)(c)(e)):
 * - (e) option の DOM の id と `aria-activedescendant` を命令の id から組まない。`useId()` の接頭辞と並びの添字
 *   (`${prefix}-opt-${index}`) で作り、現在の候補を添字 (`activeIndex`) で持つ。現在の候補を画面に入れるのは option の
 *   ref の `scrollIntoView` で、id から要素を引かない。命令の id は外部由来の値を含みうる (012 data-model §2
 *   「外部由来の値と DOM の id・セレクタ」/ §3)。命令の id は React の `key` にだけ使う
 * - element の中の絞り込み (`label.toLowerCase().includes(...)`) を外した。渡された候補を渡された順のまま描く (絞り込みは
 *   features 側の `matchesAllTerms`。spec FR-002)。グループは並びの中で続く同じ `group` の区切りで描き、並びを組み替えない
 *   (添字と描画の順を揃える)
 * - (b) 英語の文言 (`Type a command` / `Commands`) を `labels` で受ける。0 件の文 (`No command matches …`) を外し、
 *   0 件の表示は `empty` で受ける (features 側の `EmptyState`。spec FR-008)
 * - (c) 入力の keydown は `isComposing` に加えて `keyCode === 229` も見る (AD-037)
 * - 候補に補足 (`detail`) と種別 (`kind`) を足し、`keys` を省略できるようにした。入力欄の ref (`inputRef`) を足した
 */
export interface PaletteCommand {
  /** React の `key` にだけ使う。DOM の id・IDREF・セレクタに入れない。 */
  id: string;
  label: string;
  group: string;
  /** 補足 (グループ・ランタイムなど)。 */
  detail?: string | null;
  /** 種別 (稼働中 / 過去など)。 */
  kind?: string | null;
  keys?: readonly string[];
}

export interface CommandPaletteLabels {
  /** 入力欄の名前。 */
  input: string;
  placeholder: string;
  /** 候補の一覧 (listbox) の名前。 */
  list: string;
}

interface Segment {
  readonly group: string;
  readonly start: number;
  readonly commands: readonly PaletteCommand[];
}

/** 並びの中で続く同じ `group` を 1 つの区切りにする (並びは組み替えない)。 */
function segmentsOf(commands: readonly PaletteCommand[]): readonly Segment[] {
  const segments: { group: string; start: number; commands: PaletteCommand[] }[] = [];
  commands.forEach((command, index) => {
    const last = segments.at(-1);
    if (last !== undefined && last.group === command.group) last.commands.push(command);
    else segments.push({ group: command.group, start: index, commands: [command] });
  });
  return segments;
}

export function CommandPalette({
  commands,
  query,
  activeIndex,
  labels,
  empty,
  inputRef,
  onQueryChange,
  onActiveChange,
  onRun,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "commands"
  | "query"
  | "activeIndex"
  | "labels"
  | "empty"
  | "inputRef"
  | "onQueryChange"
  | "onActiveChange"
  | "onRun"
> & {
  commands: readonly PaletteCommand[];
  query: string;
  /** 現在の候補の添字。範囲の外なら現在の候補なし。 */
  activeIndex: number;
  labels: CommandPaletteLabels;
  /** 候補が 0 件のときの表示。 */
  empty?: ReactNode;
  inputRef?: Ref<HTMLInputElement>;
  onQueryChange?: (query: string) => void;
  onActiveChange?: (index: number) => void;
  onRun?: (index: number) => void;
}) {
  const prefix = useId();
  const listId = `${prefix}-list`;
  const optionId = (index: number) => `${prefix}-opt-${index}`;
  const optionRefs = useRef<(HTMLElement | null)[]>([]);
  const active = activeIndex >= 0 && activeIndex < commands.length ? activeIndex : -1;

  const move = (delta: number) => {
    if (commands.length === 0 || !onActiveChange) return;
    // 現在の候補が無ければ、押したキーの向きの端から始める。
    const from = active === -1 ? (delta > 0 ? -1 : 0) : active;
    onActiveChange((from + delta + commands.length) % commands.length);
  };

  // aria-activedescendant はフォーカスを動かさずに現在の候補を示すだけで、スクロールはフォーカスにしか付いてこない。
  // 現在の候補を ref で画面に入れる (id から要素を引かない)。
  useEffect(() => {
    if (active === -1) return;
    optionRefs.current[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 変換中のキーは確定・取り消しに任せる (`preventDefault` しない。Principle VIII / AD-037)。
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (active !== -1 && onRun) onRun(active);
    }
  };

  return (
    <div
      data-slot="command-palette"
      className={cn(
        floating,
        "flex w-full max-w-sm flex-col overflow-hidden rounded-[20px]",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <SearchIcon aria-hidden className="text-foreground/30 size-3.5 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={labels.placeholder}
          aria-label={labels.input}
          role="combobox"
          aria-expanded={commands.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active === -1 ? undefined : optionId(active)}
          autoComplete="off"
          spellCheck={false}
          className="text-foreground/85 placeholder:text-foreground/30 min-w-0 flex-1 bg-transparent text-[13.5px] outline-none"
        />
        <span
          aria-hidden
          className={cn(
            field,
            mono,
            "text-foreground/35 rounded px-1.5 py-0.5",
          )}
        >
          esc
        </span>
      </div>

      <div
        id={listId}
        role="listbox"
        aria-label={labels.list}
        className="border-foreground/[0.07] flex max-h-72 flex-col overflow-y-auto border-t p-1.5"
      >
        {segmentsOf(commands).map((segment) => (
          <div
            key={segment.start}
            role="group"
            aria-label={segment.group}
            className="flex flex-col"
          >
            <span
              aria-hidden
              className={cn(mono, "text-foreground/25 px-2 pt-2 pb-1")}
            >
              {segment.group}
            </span>
            {segment.commands.map((command, at) => {
              const index = segment.start + at;
              const selected = index === active;
              const className = cn(
                "flex items-center gap-2 rounded-xl px-2 py-1.5 text-start transition-colors",
                selected
                  ? "bg-foreground/[0.06]"
                  : onRun
                    ? "hover:bg-foreground/[0.03]"
                    : undefined,
              );
              const content = (
                <>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px]">{command.label}</span>
                    {command.detail ? (
                      <span className="text-muted-foreground truncate text-[11px]">
                        {command.detail}
                      </span>
                    ) : null}
                  </span>
                  {command.kind ? (
                    <span
                      className={cn(
                        field,
                        "text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-[11px]",
                      )}
                    >
                      {command.kind}
                    </span>
                  ) : null}
                  {command.keys && command.keys.length > 0 ? (
                    <span className="flex shrink-0 gap-1">
                      {command.keys.map((key) => (
                        <span
                          key={key}
                          className={cn(
                            field,
                            mono,
                            "text-foreground/40 rounded px-1.5 py-0.5",
                          )}
                        >
                          {key}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </>
              );
              const bind = (element: HTMLElement | null) => {
                optionRefs.current[index] = element;
              };

              return onRun ? (
                <button
                  key={command.id}
                  ref={bind}
                  id={optionId(index)}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={selected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onRun(index)}
                  className={className}
                >
                  {content}
                </button>
              ) : (
                <div
                  key={command.id}
                  ref={bind}
                  id={optionId(index)}
                  role="option"
                  aria-selected={selected}
                  className={className}
                >
                  {content}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {commands.length === 0 && empty !== undefined && (
        <div className="border-foreground/[0.07] border-t p-1.5">{empty}</div>
      )}
    </div>
  );
}
