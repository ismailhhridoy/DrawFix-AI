interface DrawFixLogoProps {
  size?: number;
  className?: string;
}

/**
 * Animated SVG brand mark illustrating DrawFix Ai:
 * architectural floor-plan walls, live compliance scan sweep,
 * and a verified egress/clearance path resolving at an exit node.
 */
export function DrawFixLogo({ size = 42, className = '' }: DrawFixLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {/* Crisp architectural frame */}
      <rect
        x="1.25"
        y="1.25"
        width="37.5"
        height="37.5"
        rx="9.5"
        fill="#F4F7FC"
        stroke="#12111A"
        strokeOpacity="0.16"
        strokeWidth="1.4"
      />

      {/* Subtle architectural cross-grid inside emblem */}
      <line x1="20" y1="5" x2="20" y2="35" stroke="#2563EB" strokeOpacity="0.08" strokeWidth="1" />
      <line x1="5" y1="20" x2="35" y2="20" stroke="#2563EB" strokeOpacity="0.08" strokeWidth="1" />

      {/* Floor-plan outer walls with bold right doorway exit opening */}
      <path
        d="M8 10H28V19M8 10V30H28V30"
        stroke="#12111A"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Interior room divider */}
      <path
        d="M17.5 10V20.5"
        stroke="#12111A"
        strokeOpacity="0.65"
        strokeWidth="2.1"
        strokeLinecap="round"
      />

      {/* Doorway swing arc */}
      <path
        d="M28 20.5C24.5 20.5 22 23 22 26.5"
        stroke="#2563EB"
        strokeOpacity="0.55"
        strokeWidth="1.4"
        strokeDasharray="2.2 2.2"
        strokeLinecap="round"
      />

      {/* Animated CAD inspection scan bar */}
      <line
        x1="7"
        y1="10.5"
        x2="29"
        y2="10.5"
        stroke="#2563EB"
        strokeOpacity="0.65"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="drawfix-scan-anim"
      />

      {/* Animated clearance/egress route exiting safely */}
      <path
        d="M12.5 15V26.5H32.5"
        stroke="#2563EB"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="drawfix-route-anim"
      />

      {/* Verified pass node */}
      <circle
        cx="32.5"
        cy="26.5"
        r="3.2"
        fill="#10B981"
        className="drawfix-exit-anim"
      />
    </svg>
  );
}
