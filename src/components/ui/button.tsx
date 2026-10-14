import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

const button = cva(
  'inline-flex shrink-0 items-center justify-center gap-[6px] whitespace-nowrap border text-t11 transition-colors active:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-line bg-raise text-ink-2 hover:border-line-hi hover:text-ink',
        primary:
          'border-signal/55 bg-signal/15 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:bg-signal/25',
        ghost: 'border-transparent bg-transparent text-ink-3 hover:bg-raise hover:text-ink',
        danger: 'border-critical/55 bg-critical/15 text-ink hover:bg-critical/25',
        active: 'border-signal/45 bg-signal/12 text-signal',
      },
      size: {
        sm: 'h-[22px] px-[7px]',
        md: 'h-[26px] px-[10px]',
        lg: 'h-[32px] px-3 text-t12',
        icon: 'h-[26px] w-[26px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>

export function Button({ className, variant, size, type = 'button', ...p }: Props) {
  return <button type={type} className={cn(button({ variant, size }), className)} style={{ borderRadius: 2 }} {...p} />
}
