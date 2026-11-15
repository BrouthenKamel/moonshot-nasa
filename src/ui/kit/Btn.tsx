import type { ButtonHTMLAttributes } from 'react'

/** Flight-plan buttons: primary is flat Kapton, secondary a hairline, ghost a bare label */
export function Btn({ variant = 'secondary', className = '', ...rest }: { variant?: 'primary' | 'secondary' | 'ghost' } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...rest} className={`fp-btn-${variant} ${className}`} />
}
