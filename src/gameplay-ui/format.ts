/** Presentation only: keep simulation HP precision and clamp the rounded label to rounded Max HP. */
export function displayHp(currentHp: number, maxHp: number) {
  const max = Math.max(0, Math.round(maxHp));
  return { current: Math.max(0, Math.min(max, Math.round(currentHp))), max };
}
