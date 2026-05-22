"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronRightIcon, CheckIcon } from "lucide-react"

// Native HTML-based dropdown menu implementation (no @base-ui/react dependency)

type DropdownMenuContextType = {
  open: boolean
  setOpen: (open: boolean) => void
}

const DropdownMenuContext = React.createContext<DropdownMenuContextType>({
  open: false,
  setOpen: () => {},
})

function DropdownMenu({
  children,
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
}: {
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen)
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen
  const setOpen = React.useCallback(
    (value: boolean) => {
      setInternalOpen(value)
      onOpenChange?.(value)
    },
    [onOpenChange]
  )

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div data-slot="dropdown-menu" className="relative inline-block">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  )
}

function DropdownMenuPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DropdownMenuTrigger({
  className,
  children,
  asChild: _asChild,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { open, setOpen } = React.useContext(DropdownMenuContext)
  return (
    <button
      data-slot="dropdown-menu-trigger"
      type="button"
      aria-expanded={open}
      aria-haspopup="menu"
      className={cn("outline-none", className)}
      onClick={() => setOpen(!open)}
      {...props}
    >
      {children}
    </button>
  )
}

function DropdownMenuContent({
  className,
  align = "start",
  side = "bottom",
  sideOffset: _sideOffset = 4,
  alignOffset: _alignOffset = 0,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
  sideOffset?: number
  alignOffset?: number
}) {
  const { open, setOpen } = React.useContext(DropdownMenuContext)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.closest("[data-slot=dropdown-menu]")?.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open, setOpen])

  if (!open) return null

  const alignClass =
    align === "end" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0"
  const sideClass = side === "top" ? "bottom-full mb-1" : "top-full mt-1"

  return (
    <div
      ref={ref}
      data-slot="dropdown-menu-content"
      role="menu"
      className={cn(
        "absolute z-50 min-w-32 overflow-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 animate-in fade-in-0 zoom-in-95",
        alignClass,
        sideClass,
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function DropdownMenuGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-group"
      role="group"
      className={cn(className)}
      {...props}
    />
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<"div"> & { inset?: boolean }) {
  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  onClick,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean
  variant?: "default" | "destructive"
  onSelect?: () => void
}) {
  const { setOpen } = React.useContext(DropdownMenuContext)
  return (
    <div
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      role="menuitem"
      tabIndex={0}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10",
        className
      )}
      onClick={(e) => {
        onClick?.(e)
        setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>)
          setOpen(false)
        }
      }}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  onClick,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean
  checked?: boolean
}) {
  const { setOpen } = React.useContext(DropdownMenuContext)
  return (
    <div
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      role="menuitemcheckbox"
      aria-checked={checked}
      tabIndex={0}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground data-inset:pl-7",
        className
      )}
      onClick={(e) => {
        onClick?.(e)
        setOpen(false)
      }}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex items-center justify-center">
        {checked && <CheckIcon className="size-4" />}
      </span>
      {children}
    </div>
  )
}

function DropdownMenuRadioGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-radio-group"
      role="group"
      className={cn(className)}
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  onClick,
  ...props
}: React.ComponentProps<"div"> & {
  inset?: boolean
  value?: string
}) {
  const { setOpen } = React.useContext(DropdownMenuContext)
  return (
    <div
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      role="menuitemradio"
      tabIndex={0}
      className={cn(
        "relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground data-inset:pl-7",
        className
      )}
      onClick={(e) => {
        onClick?.(e)
        setOpen(false)
      }}
      {...props}
    >
      {children}
    </div>
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-separator"
      role="separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground group-focus/dropdown-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<"div"> & { inset?: boolean }) {
  return (
    <div
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground hover:bg-accent hover:text-accent-foreground data-inset:pl-7",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </div>
  )
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "z-50 min-w-24 overflow-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
