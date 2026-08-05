import React from 'react'
import { ORDER_STATUS_META, PRODUCT_STATUS_META } from '../lib/stateMachine'

// ── Order Status Badge ──────────────────────────────────────────────────────
export const OrderStatusBadge = ({ status, size = 'sm' }) => {
  const meta = ORDER_STATUS_META[status] || ORDER_STATUS_META.pending;
  const sizeClasses = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${meta.color} ${sizeClasses}`}>
      <span className="text-xs">{meta.icon}</span>
      {meta.label}
    </span>
  );
};

// ── Product Status Badge ────────────────────────────────────────────────────
export const ProductStatusBadge = ({ status, size = 'sm' }) => {
  const meta = PRODUCT_STATUS_META[status] || PRODUCT_STATUS_META.pending;
  const sizeClasses = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${meta.color} ${sizeClasses}`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.dot }} />
      {meta.label}
    </span>
  );
};

// ── Production Progress Bar ─────────────────────────────────────────────────
export const ProductionProgressBar = ({ status }) => {
  const meta = PRODUCT_STATUS_META[status];
  if (!meta || meta.progress === null) return null;
  return (
    <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${meta.progress}%`, background: meta.dot }}
      />
    </div>
  );
};

// ── Production Stage Stepper (horizontal) ───────────────────────────────────
export const ProductionStepper = ({ currentStage, onAdvance, onSetStage, compact = false }) => {
  const stages = ['fabrication', 'dyeing', 'marking', 'embroidery', 'stitching', 'ready'];
  const currentIdx = stages.indexOf(currentStage);
  const isSpecial = ['alterations', 'trials', 'return_requested', 'returned', 'cancelled', 'pending'].includes(currentStage);

  if (compact) {
    return (
      <div className="flex items-center gap-0.5">
        {stages.map((stage, i) => {
          const meta = PRODUCT_STATUS_META[stage];
          const isActive = i === currentIdx;
          const isPast = !isSpecial && i < currentIdx;
          return (
            <div
              key={stage}
              title={meta.label}
              onClick={onSetStage ? () => onSetStage(stage) : undefined}
              className={`w-3 h-3 rounded-full border-2 transition-all ${onSetStage ? 'cursor-pointer hover:scale-125' : ''} ${
                isActive ? 'border-transparent scale-110' : isPast ? 'border-transparent' : 'border-gray-200 bg-white'
              }`}
              style={{ background: isActive || isPast ? meta.dot : undefined }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map((stage, i) => {
        const meta = PRODUCT_STATUS_META[stage];
        const isActive = i === currentIdx;
        const isPast = !isSpecial && i < currentIdx;
        return (
          <React.Fragment key={stage}>
            {i > 0 && <div className={`w-4 h-0.5 ${isPast || isActive ? 'bg-emerald-300' : 'bg-gray-200'}`} />}
            <button
              onClick={onSetStage ? () => onSetStage(stage) : undefined}
              disabled={!onSetStage}
              title={meta.label}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all ${
                isActive ? `${meta.color} ring-2 ring-offset-1` : isPast ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-400'
              } ${onSetStage ? 'cursor-pointer hover:opacity-80' : ''}`}
              style={isActive ? { ringColor: meta.dot } : {}}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: isActive || isPast ? meta.dot : '#d1d5db' }} />
              <span className="hidden sm:inline">{meta.label}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default OrderStatusBadge
