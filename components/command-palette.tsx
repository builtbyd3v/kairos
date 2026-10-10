"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type PaletteItem = { label: string; hint: string; href: string; group: string };

// ⌘K jump-to anything: pages, missions, waypoints, anomalies. Native <dialog> handles focus trap and Escape.
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const q = query.trim().toLowerCase();
  const results = (q ? items.filter((i) => `${i.label} ${i.hint} ${i.group}`.toLowerCase().includes(q)) : items).slice(0, 12);

  // Global shortcut: the keyboard is the outside system here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) dialog.current.close();
        else dialog.current?.showModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(item: PaletteItem | undefined) {
    if (!item) return;
    dialog.current?.close();
    setQuery("");
    setActive(0);
    router.push(item.href);
  }

  return (
    <>
      <button
        onClick={() => dialog.current?.showModal()}
        className="flex w-full items-center gap-2 rounded-full border border-border bg-background/60 px-3.5 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        <Search aria-hidden className="size-4" />
        Search…
        <kbd className="ml-auto rounded border border-border px-1.5 font-mono text-[11px]">⌘K</kbd>
      </button>
      <dialog
        ref={dialog}
        aria-label="Search the console"
        onClose={() => setQuery("")}
        className="m-auto mt-[15vh] w-full max-w-xl rounded-xl border border-border bg-popover p-0 text-foreground shadow-2xl backdrop:bg-black/60"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search aria-hidden className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(results.length - 1, a + 1));
              if (e.key === "ArrowUp") setActive((a) => Math.max(0, a - 1));
              if (e.key === "Enter") go(results[active]);
            }}
            placeholder="Jump to a mission, waypoint, anomaly or page…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-${active}` : undefined}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-helper"
          />
        </div>
        <ul id="palette-results" role="listbox" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches &quot;{query}&quot;</li>}
          {results.map((r, i) => (
            <li
              key={r.href + r.label}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(r)}
              className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm", i === active && "bg-accent")}
            >
              <span className="w-20 shrink-0 text-[11px] tracking-wider text-helper uppercase">{r.group}</span>
              <span className="font-medium">{r.label}</span>
              <span className="truncate text-muted-foreground">{r.hint}</span>
              {i === active && <CornerDownLeft aria-hidden className="ml-auto size-3.5 text-helper" />}
            </li>
          ))}
        </ul>
      </dialog>
    </>
  );
}
