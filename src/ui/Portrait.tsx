export function Portrait() {
  return (
    <svg
      className="portrait"
      viewBox="0 0 360 380"
      aria-label="Keeper of the spark in the ancient ruins"
      role="img"
    >
      <defs>
        <radialGradient id="halo">
          <stop stopColor="#b0dbb0" stopOpacity=".2" />
          <stop offset="1" stopColor="#2b4538" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="cloak" x2="1" y2="1">
          <stop stopColor="#7eaa8c" />
          <stop offset="1" stopColor="#233e32" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <circle cx="180" cy="180" r="170" fill="url(#halo)" />
      <g fill="none" stroke="#a8b990" opacity=".3">
        <circle cx="180" cy="180" r="125" />
        <circle cx="180" cy="180" r="131" strokeDasharray="2 14" />
        <path d="M180 24v26m0 260v26M24 180h26m260 0h26M70 70l18 18m184 184 18 18M70 290l18-18M272 88l18-18" />
      </g>
      <ellipse cx="181" cy="327" rx="92" ry="19" fill="#070e0b" opacity=".5" />
      <path d="M112 314l25-128 44-46 46 49 28 129-76-23z" fill="url(#cloak)" />
      <path d="M179 157l-16 99-51 58 62-18 43 16-16-78z" fill="#89ae8e" opacity=".6" />
      <path d="M148 196l-42 46 21 17 45-47m38-17 39 32-7 18-49-24" fill="#456950" />
      <path d="M132 182q-7-66 48-72 55 6 49 72l-48 33z" fill="#385644" />
      <path d="M151 162q29-29 57 1l-11 27h-36z" fill="#10271e" />
      <path d="M162 165l12 2m14 0 12-2" stroke="#e1f7c4" strokeWidth="4" />
      <path d="M239 308l15-177" stroke="#aa9f78" strokeWidth="6" />
      <path d="m242 159 12-28 13 27" fill="none" stroke="#c7bb91" strokeWidth="3" />
      <ellipse cx="256" cy="119" rx="21" ry="29" fill="#bcffd7" opacity=".7" filter="url(#glow)" />
      <path d="M255 88q-22 24-8 44 25 8 20-18z" fill="#b6efd0" />
      <path d="m257 105-8 20 9 5 4-11z" fill="#f3ffe9" />
      <g fill="#c3d5a3">
        <circle cx="88" cy="126" r="2" />
        <circle cx="288" cy="237" r="2" />
        <circle cx="112" cy="278" r="1.5" />
        <circle cx="207" cy="63" r="1.5" />
        <circle cx="71" cy="222" r="1.5" />
      </g>
    </svg>
  );
}
