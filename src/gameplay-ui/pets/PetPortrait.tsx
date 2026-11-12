import type { ReactElement } from 'react';
import type { PetId } from '../../pets';

/**
 * Task 20: original procedural pet portraits (inline SVG, no assets). Simple round shapes in the
 * pet's colours; `animated` adds a gentle idle bob (disabled by prefers-reduced-motion in CSS).
 */
export function PetPortrait({
  id,
  size = 64,
  animated = false,
}: {
  id: PetId;
  size?: number;
  animated?: boolean;
}) {
  return (
    <svg
      className={`pet-portrait pet-${id} ${animated ? 'bob' : ''}`}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
    >
      <circle cx="32" cy="34" r="28" className="pet-halo" />
      <g className="pet-body">{BODIES[id]}</g>
    </svg>
  );
}
const eyes = (y: number, dx = 7, r = 2.4) => (
  <>
    <circle cx={32 - dx} cy={y} r={r} fill="#1b1410" />
    <circle cx={32 + dx} cy={y} r={r} fill="#1b1410" />
    <circle cx={32 - dx + 0.8} cy={y - 0.8} r={0.8} fill="#fff" />
    <circle cx={32 + dx + 0.8} cy={y - 0.8} r={0.8} fill="#fff" />
  </>
);
const BODIES: Record<PetId, ReactElement> = {
  firefly: (
    <>
      <ellipse cx="22" cy="24" rx="9" ry="6" fill="#dff3ff" opacity="0.7" />
      <ellipse cx="42" cy="24" rx="9" ry="6" fill="#dff3ff" opacity="0.7" />
      <circle cx="32" cy="40" r="11" fill="#ffe27a" />
      <circle cx="32" cy="40" r="17" fill="#ffe27a" opacity="0.25" />
      <circle cx="32" cy="27" r="8" fill="#4a3b2a" />
      {eyes(27, 3.4, 1.8)}
    </>
  ),
  owlet: (
    <>
      <ellipse cx="32" cy="38" rx="17" ry="19" fill="#c9a27a" />
      <ellipse cx="32" cy="44" rx="10" ry="11" fill="#ead6b8" />
      <path d="M17 22 L22 30 L26 24 Z M47 22 L42 30 L38 24 Z" fill="#a07a52" />
      <circle cx="25" cy="32" r="7" fill="#fff6e2" />
      <circle cx="39" cy="32" r="7" fill="#fff6e2" />
      {eyes(32, 7, 3.2)}
      <path d="M29.5 37 L34.5 37 L32 41 Z" fill="#e3a43c" />
    </>
  ),
  fox: (
    <>
      <path d="M14 16 L26 26 L18 34 Z M50 16 L38 26 L46 34 Z" fill="#ff8a3d" />
      <path d="M32 54 C16 50 14 32 20 26 L44 26 C50 32 48 50 32 54 Z" fill="#ff8a3d" />
      <path d="M32 54 C24 50 22 42 26 38 L38 38 C42 42 40 50 32 54 Z" fill="#fff1e2" />
      {eyes(35, 7, 2.6)}
      <circle cx="32" cy="45" r="2.2" fill="#1b1410" />
      <path d="M44 14 C48 6 54 10 50 16 C47 20 44 18 44 14 Z" fill="#ffd36b" opacity="0.9" />
    </>
  ),
  hedgehog: (
    <>
      <path
        d="M10 44 L14 28 L20 34 L22 18 L28 28 L32 12 L36 28 L42 18 L44 34 L50 28 L54 44 Z"
        fill="#6e5a44"
      />
      <ellipse cx="32" cy="44" rx="18" ry="12" fill="#d9c09a" />
      {eyes(42, 6.5, 2.4)}
      <circle cx="32" cy="48" r="2.4" fill="#1b1410" />
    </>
  ),
  kitten: (
    <>
      <path d="M15 18 L24 26 L16 32 Z M49 18 L40 26 L48 32 Z" fill="#f0c060" />
      <circle cx="32" cy="38" r="17" fill="#f0c060" />
      <path d="M22 30 L26 32 M42 30 L38 32" stroke="#c98a2a" strokeWidth="2" />
      {eyes(37, 7, 2.8)}
      <path d="M30 43 L34 43 L32 45.5 Z" fill="#e88a8a" />
      <circle cx="47" cy="50" r="6" fill="#ffd36b" stroke="#c98a2a" strokeWidth="1.5" />
    </>
  ),
  wolf: (
    <>
      <path d="M14 14 L25 26 L16 32 Z M50 14 L39 26 L48 32 Z" fill="#9fd2ff" opacity="0.9" />
      <path
        d="M32 56 C18 52 14 34 20 26 L44 26 C50 34 46 52 32 56 Z"
        fill="#9fd2ff"
        opacity="0.9"
      />
      <path d="M32 56 C26 52 25 44 28 40 L36 40 C39 44 38 52 32 56 Z" fill="#e6f4ff" />
      <circle cx="25" cy="35" r="2.6" fill="#ffffff" />
      <circle cx="39" cy="35" r="2.6" fill="#ffffff" />
      <circle cx="32" cy="48" r="2.4" fill="#2b4660" />
    </>
  ),
};
