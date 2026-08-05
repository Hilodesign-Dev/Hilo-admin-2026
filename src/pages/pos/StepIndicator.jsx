import React from 'react'
import { POS_T, MIcon } from './tokens'

/**
 * Stitch-style step indicator — numbered circles with connecting lines.
 * Used at the top of POSNewOrder and QuotationBuilder.
 */
const StepIndicator = ({ steps, current, onJump }) => {
  const currentIdx = steps.findIndex(s => s.key === current)
  return (
    <div className="py-3 -mx-4 sm:-mx-6 lg:-mx-8 px-4 mb-5"
      style={{ background: POS_T.surfaceContainerLowest, borderBottom: `1px solid ${POS_T.outlineVariant}` }}>
      <div className="flex items-center justify-center max-w-2xl mx-auto gap-1 sm:gap-2 overflow-x-auto scrollbar-none">
        {steps.map((s, i) => {
          const isPast = i < currentIdx
          const isCurrent = i === currentIdx
          const canJump = isPast && typeof onJump === 'function'
          return (
            <React.Fragment key={s.key}>
              <button
                disabled={!canJump}
                onClick={() => canJump && onJump(s.key)}
                className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0"
                style={{ opacity: isCurrent || isPast ? 1 : 0.45, cursor: canJump ? 'pointer' : 'default' }}>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0"
                  style={{
                    background: isCurrent ? POS_T.primary : isPast ? POS_T.success : POS_T.surfaceContainerHigh,
                    color: isCurrent ? POS_T.onPrimary : isPast ? POS_T.onPrimary : POS_T.onSurface,
                  }}>
                  {isPast ? <MIcon name="check" size={16} /> : (i + 1)}
                </div>
                <span className="text-[10px] sm:text-xs font-bold tracking-[0.1em] uppercase"
                  style={{ color: isCurrent ? POS_T.primary : POS_T.onSurface }}>
                  {s.label}
                </span>
              </button>
              {i < steps.length - 1 && (
                <div className="w-6 sm:w-12 h-px flex-shrink-0" style={{ background: POS_T.outlineVariant }} />
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

export default StepIndicator
