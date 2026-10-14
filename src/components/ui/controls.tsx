import { Select as S, Slider as Sl, Switch as Sw } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from './cn'

export function Switch({
  checked,
  onCheckedChange,
  label,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-[3px] text-t11 text-ink-2">
      {label}
      <Sw.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-[14px] w-[26px] shrink-0 border border-line-hi bg-raise transition-colors data-[state=checked]:border-signal/60 data-[state=checked]:bg-signal/25"
        style={{ borderRadius: 2 }}
      >
        <Sw.Thumb className="block h-[8px] w-[8px] translate-x-[2px] bg-ink-3 transition-transform data-[state=checked]:translate-x-[14px] data-[state=checked]:bg-signal" />
      </Sw.Root>
    </label>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  format = String,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  /** fires once when the thumb is released */
  onCommit?: (v: number) => void
  format?: (v: number) => string
  disabled?: boolean
}) {
  // hold the thumb where the hand is while dragging, even if the value is only committed on release
  const [local, setLocal] = useState<number | null>(null)
  const shown = local ?? value
  return (
    <div className={cn('py-[5px]', disabled && 'opacity-40')}>
      <div className="flex items-baseline justify-between">
        <span className="text-t11 text-ink-2">{label}</span>
        <span className="font-mono text-t10 tabular-nums text-ink">{format(shown)}</span>
      </div>
      <Sl.Root
        value={[shown]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => {
          setLocal(v)
          onChange(v)
        }}
        onValueCommit={([v]) => {
          setLocal(null)
          onCommit?.(v)
        }}
        className="relative mt-[6px] flex h-[14px] touch-none select-none items-center"
      >
        <Sl.Track className="relative h-[2px] grow bg-line-hi">
          <Sl.Range className="absolute h-full bg-signal" />
        </Sl.Track>
        <Sl.Thumb
          aria-label={label}
          className="block h-[10px] w-[10px] border border-signal bg-void outline-none focus-visible:bg-signal"
          style={{ borderRadius: 1 }}
        />
      </Sl.Root>
    </div>
  )
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  disabled,
}: {
  value: string
  onValueChange: (v: string) => void
  options: { value: string; label: ReactNode }[]
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <S.Trigger
        className={cn(
          'inline-flex h-[26px] items-center justify-between gap-2 border border-line bg-raise px-2 text-t11 text-ink-2 outline-none transition-colors hover:border-line-hi data-[placeholder]:text-ink-3 focus-visible:border-signal disabled:opacity-40',
          className,
        )}
        style={{ borderRadius: 2 }}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronDown size={11} />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={3}
          className="z-[70] min-w-[var(--radix-select-trigger-width)] border border-line-hi bg-void p-[2px] shadow-[0_8px_24px_rgba(0,0,0,0.5)] data-[state=open]:animate-[pop-in_.14s_ease-out] data-[state=closed]:animate-[pop-out_.09s_ease-in]"
          style={{ borderRadius: 2 }}
        >
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex h-[24px] cursor-pointer select-none items-center gap-2 px-2 pr-6 text-t11 text-ink-2 outline-none data-[highlighted]:bg-raise data-[highlighted]:text-ink"
              >
                <S.ItemText>{o.label}</S.ItemText>
                <S.ItemIndicator className="absolute right-2">
                  <Check size={10} className="text-signal" />
                </S.ItemIndicator>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  )
}

/** A small row of mutually exclusive choices. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-[3px]">
      <span className="text-t10 text-ink-2">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex border border-line" style={{ borderRadius: 2 }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            className={cn('px-[8px] py-[3px] text-t9 transition-colors', value === o.value ? 'bg-raise text-signal' : 'text-ink-3 hover:text-ink-2')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
