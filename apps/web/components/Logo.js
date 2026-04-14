/**
 * AsyncOps Logo — icon-only and wordmark variants.
 *
 * Concept: A stylized terminal prompt chevron (">") merging into
 * a flow/pipeline node, representing async job execution.
 * The chevron has a subtle glow in emerald, evoking a live terminal.
 */

export function LogoIcon({ size = 24, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="AsyncOps logo"
    >
      <defs>
        <linearGradient id="ao-icon-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <filter id="ao-glow">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Background rounded square */}
      <rect width="32" height="32" rx="7" fill="#0b0b0b" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="6.5" stroke="white" strokeOpacity="0.08" />
      {/* Terminal chevron ">" */}
      <path
        d="M8 10L15 16L8 22"
        stroke="url(#ao-icon-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#ao-glow)"
      />
      {/* Cursor/pipeline line */}
      <line
        x1="17"
        y1="22"
        x2="24"
        y2="22"
        stroke="url(#ao-icon-grad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        filter="url(#ao-glow)"
      />
      {/* Flow node dot */}
      <circle cx="24" cy="12" r="2" fill="#22c55e" opacity="0.7" />
      {/* Connecting dashed line from chevron tip to node */}
      <line
        x1="16"
        y1="16"
        x2="22"
        y2="12"
        stroke="#22c55e"
        strokeWidth="1"
        strokeOpacity="0.3"
        strokeDasharray="2 2"
      />
    </svg>
  );
}

export function LogoWordmark({ iconSize = 24, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoIcon size={iconSize} />
      <span className="text-sm font-semibold tracking-tight text-white">
        AsyncOps
      </span>
    </div>
  );
}

export function LogoIconDark({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="AsyncOps"
    >
      <defs>
        <linearGradient id="ao-fav-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="#0b0b0b" />
      <path
        d="M8 10L15 16L8 22"
        stroke="url(#ao-fav-grad)"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="17"
        y1="22"
        x2="24"
        y2="22"
        stroke="url(#ao-fav-grad)"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
