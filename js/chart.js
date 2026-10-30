// Donut chart geometry. Pure so it can be unit-tested; app.js turns it into SVG.
// The circle radius is 100 / (2 * PI), so its circumference is exactly 100 and
// stroke-dasharray values can be written directly as percentages.

export const DONUT_RADIUS = 100 / (2 * Math.PI);
export const PALETTE_SIZE = 8;

/** @param {{id: string, amount: number}[]} lines */
export function donutSegments(lines) {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  let cumulative = 0;
  return lines.map((l, i) => {
    const share = total > 0 ? (l.amount / total) * 100 : 0;
    const seg = {
      id: l.id,
      colorIndex: i % PALETTE_SIZE,
      share,
      dash: `${share} ${100 - share}`,
      offset: 25 - cumulative, // 25 starts the first segment at 12 o'clock
    };
    cumulative += share;
    return seg;
  });
}
