import * as React from "react"
import { Info } from "lucide-react"
import { cn } from "cn"

function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-2xl bg-card py-(--card-spacing) text-sm text-card-foreground shadow-[0_1px_0_0_rgb(255_255_255/0.05)_inset,0_12px_32px_-20px_rgb(0_0_0/0.8)] ring-1 ring-white/[0.06] transition-[translate,box-shadow] duration-200 ease-out hover:shadow-[0_1px_0_0_rgb(255_255_255/0.06)_inset,0_18px_40px_-20px_rgb(0_0_0/0.9)] hover:ring-white/[0.09] motion-safe:hover:-translate-y-px [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-2xl *:[img:last-child]:rounded-b-2xl",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-2xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

// Card titles are small uppercase mono labels, like label-caps in globals.css.
// note: spelled out as Tailwind classes (not label-caps) so callers' text-* overrides merge cleanly through cn.
function CardTitle({
  className,
  info,
  children,
  ...props
}: React.ComponentProps<"h2"> & { info?: string }) {
  // h2: every card is a section of its page, so screen reader users can jump card to card by heading.
  return (
    <h2
      data-slot="card-title"
      className={cn(
        "flex items-center gap-1.5 font-mono text-[11px] leading-4 font-medium tracking-[0.12em] text-muted-foreground uppercase",
        className
      )}
      {...props}
    >
      {children}
      {info && (
        <span title={info} className="text-helper">
          <Info aria-hidden className="size-3.5" />
          <span className="sr-only">{info}</span>
        </span>
      )}
    </h2>
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-[13px] text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t border-white/[0.06] bg-panel/60 px-(--card-spacing) py-2.5 text-xs",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
