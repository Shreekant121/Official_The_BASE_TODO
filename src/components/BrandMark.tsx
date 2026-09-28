/**
 * The BASE mark, where V3 puts it: at the head of the rail, or in the header
 * of a screen too narrow to have a rail. V3-2 moved it there on Home
 * (`Devices.dc.html`); `Project.dc.html` draws the same rail, so V3-3 lifted
 * it out of Home rather than drawing it twice.
 */

/** The mark on its own — for a header with no rail beside it. */
export function BrandMark() {
  return (
    <img
      src="/brand/mark-white.png"
      alt="BASE"
      width={26}
      height={26}
      style={{ display: 'block', flex: '0 0 auto', filter: 'drop-shadow(0 2px 6px oklch(0 0 0 / 0.5))' }}
    />
  );
}

/** The mark as `MiniNav`'s `lead`, spaced the way the design spaces it. */
export function RailMark() {
  return (
    <span style={{ margin: 'var(--sp-3) 0 var(--sp-5)' }}>
      <BrandMark />
    </span>
  );
}
