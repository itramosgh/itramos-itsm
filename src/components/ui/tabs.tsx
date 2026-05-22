"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// Native HTML-based tabs implementation (no @base-ui/react dependency)

type TabsContextType = {
  activeTab: string
  setActiveTab: (value: string) => void
  orientation: "horizontal" | "vertical"
  variant?: "default" | "line"
}

const TabsContext = React.createContext<TabsContextType>({
  activeTab: "",
  setActiveTab: () => {},
  orientation: "horizontal",
  variant: "default",
})

interface TabsProps {
  className?: string
  orientation?: "horizontal" | "vertical"
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  children?: React.ReactNode
}

function Tabs({
  className,
  orientation = "horizontal",
  defaultValue = "",
  value: controlledValue,
  onValueChange,
  children,
  ...props
}: TabsProps) {
  const [internalValue, setInternalValue] = React.useState(defaultValue)
  const activeTab = controlledValue !== undefined ? controlledValue : internalValue
  const setActiveTab = React.useCallback(
    (value: string) => {
      setInternalValue(value)
      onValueChange?.(value)
    },
    [onValueChange]
  )

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, orientation }}>
      <div
        data-slot="tabs"
        data-orientation={orientation}
        className={cn(
          "group/tabs flex gap-2 data-horizontal:flex-col",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface TabsListProps extends React.ComponentProps<"div">, VariantProps<typeof tabsListVariants> {}

function TabsList({ className, variant = "default", children, ...props }: TabsListProps) {
  return (
    <TabsContext.Provider value={{ ...React.useContext(TabsContext), variant: variant ?? "default" }}>
      <div
        data-slot="tabs-list"
        data-variant={variant}
        role="tablist"
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  )
}

interface TabsTriggerProps extends React.ComponentProps<"button"> {
  value: string
}

function TabsTrigger({ className, value, children, ...props }: TabsTriggerProps) {
  const { activeTab, setActiveTab } = React.useContext(TabsContext)
  const isActive = activeTab === value

  return (
    <button
      data-slot="tabs-trigger"
      role="tab"
      type="button"
      aria-selected={isActive}
      data-active={isActive ? "" : undefined}
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap transition-all",
        "text-foreground/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        isActive && "bg-background text-foreground shadow-sm",
        className
      )}
      onClick={() => setActiveTab(value)}
      {...props}
    >
      {children}
    </button>
  )
}

interface TabsContentProps extends React.ComponentProps<"div"> {
  value: string
}

function TabsContent({ className, value, children, ...props }: TabsContentProps) {
  const { activeTab } = React.useContext(TabsContext)
  if (activeTab !== value) return null

  return (
    <div
      data-slot="tabs-content"
      role="tabpanel"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    >
      {children}
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
