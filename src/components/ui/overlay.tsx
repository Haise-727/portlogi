import { Dialog as D, Popover as P, Tabs as T, Tooltip as Tt } from 'radix-ui'
import { X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from './cn'

/* ---------- Tabs ---------- */

export const Tabs = T.Root

export function TabsList({ className, ...p }: ComponentProps<typeof T.List>) {
  return <T.List className={cn('flex border-b border-line', className)} {...p} />
}

export function TabsTrigger({ className, ...p }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        'flex-1 px-2 py-[8px] text-[11px] text-ink-3 outline-none transition-colors hover:text-ink-2 data-[state=active]:text-ink data-[state=active]:shadow-[inset_0_-1px_0_var(--color-signal)] focus-visible:text-ink',
        className,
      )}
      {...p}
    />
  )
}

export function TabsContent({ className, ...p }: ComponentProps<typeof T.Content>) {
  return <T.Content className={cn('min-h-0 flex-1 overflow-y-auto outline-none', className)} {...p} />
}

/* ---------- Popover ---------- */

export const Popover = P.Root
export const PopoverTrigger = P.Trigger

export function PopoverContent({ className, ...p }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={6}
        align="start"
        className={cn(
          'z-[60] border border-line-hi bg-void shadow-[0_10px_30px_rgba(0,0,0,0.55)] outline-none data-[state=open]:animate-[pop-in_.16s_ease-out] data-[state=closed]:animate-[pop-out_.1s_ease-in]',
          className,
        )}
        style={{ borderRadius: 2 }}
        {...p}
      />
    </P.Portal>
  )
}

/* ---------- Tooltip ---------- */

export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tt.Root delayDuration={350}>
      <Tt.Trigger asChild>{children}</Tt.Trigger>
      <Tt.Portal>
        <Tt.Content
          sideOffset={5}
          className="z-[80] border border-line-hi bg-void px-[6px] py-[3px] text-[10px] text-ink-2 data-[state=delayed-open]:animate-[pop-in_.12s_ease-out] data-[state=instant-open]:animate-[pop-in_.12s_ease-out] data-[state=closed]:animate-[pop-out_.08s_ease-in]"
          style={{ borderRadius: 2 }}
        >
          {label}
        </Tt.Content>
      </Tt.Portal>
    </Tt.Root>
  )
}

export const TipProvider = Tt.Provider

/* ---------- Dialog ---------- */

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay
          className="fixed inset-0 z-50 data-[state=open]:animate-[fade-in_.18s_ease-out] data-[state=closed]:animate-[fade-out_.12s_ease-in]"
          style={{ background: 'color-mix(in srgb, var(--color-void) 82%, transparent)' }}
        />
        <D.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(1000px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col border border-line-hi bg-panel outline-none data-[state=open]:animate-[dialog-in_.2s_ease-out] data-[state=closed]:animate-[dialog-out_.12s_ease-in]',
            className,
          )}
          style={{ borderRadius: 2 }}
        >
          <header className="flex items-baseline gap-3 border-b border-line px-3 py-2">
            <D.Title className="text-[12px] font-medium text-ink">{title}</D.Title>
            {description && <D.Description className="text-[10px] text-ink-3">{description}</D.Description>}
            <D.Close className="ml-auto self-center text-ink-3 transition-colors hover:text-ink" aria-label="Close">
              <X size={14} />
            </D.Close>
          </header>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
