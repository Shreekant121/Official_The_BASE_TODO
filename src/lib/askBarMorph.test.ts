import { describe, expect, it } from 'vitest';
import { morphFrames, pillCorners, readCorners, usableBox } from './askBarMorph';

describe('askBarMorph', () => {
  it('refuses a bar that is not drawn', () => {
    expect(usableBox(null)).toBeNull();
    expect(usableBox({ left: 0, top: 0, width: 0, height: 0 })).toBeNull();
    expect(usableBox({ left: 10, top: 10, width: 320, height: Number.NaN })).toBeNull();
    expect(usableBox({ left: 10, top: 700, width: 320, height: 48 })).toEqual({ left: 10, top: 700, width: 320, height: 48 });
  });

  it('reads computed radii, a pair or a bad value included', () => {
    expect(readCorners(['28px', '0px', '0px', '28px'])).toEqual([28, 0, 0, 28]);
    expect(readCorners(['28px 30px', '', 'auto'])).toEqual([28, 0, 0, 0]);
  });

  it('rounds a pill by half its height, never 9999px', () => {
    expect(pillCorners({ left: 0, top: 0, width: 320, height: 48 })).toEqual([24, 24, 24, 24]);
  });

  it('runs from the bar to the panel, corner by corner', () => {
    const bar = { left: 1096, top: 828, width: 320, height: 48 };
    const panel = { left: 1036, top: 0, width: 404, height: 900 };
    const [start, end] = morphFrames(bar, pillCorners(bar), panel, [28, 0, 0, 28]);
    expect(start).toMatchObject({ left: '1096px', top: '828px', width: '320px', height: '48px', borderTopRightRadius: '24px' });
    expect(end).toMatchObject({
      left: '1036px', top: '0px', width: '404px', height: '900px',
      borderTopLeftRadius: '28px', borderTopRightRadius: '0px', borderBottomRightRadius: '0px', borderBottomLeftRadius: '28px',
    });
  });
});
