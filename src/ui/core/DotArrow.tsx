/**
 * The arrow in his "Get Started" reference, drawn in dots: a small pixel
 * chevron on a 5×5 grid (BIG-6). It rides on the gel's tile and after a dot
 * arrow link ("See all"). Moved here from the Dashboard's `parts.tsx` at
 * 29-1P1 so every button that wants it draws the same one.
 */
export function DotArrow({ color = 'currentColor', size = 18 }: { color?: string; size?: number }) {
  /* [column, row] on a 5×5 grid: a right arrow, shaft and head. */
  const dots: [number, number][] = [
    [2, 0],
    [3, 1],
    [0, 2], [1, 2], [2, 2], [3, 2], [4, 2],
    [3, 3],
    [2, 4],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      {dots.map(([c, r]) => (
        <rect key={`${c}-${r}`} x={2 + c * 3} y={2 + r * 3} width="2.4" height="2.4" rx="0.5" fill={color} />
      ))}
    </svg>
  );
}
