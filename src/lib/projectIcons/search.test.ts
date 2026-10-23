import { describe, expect, it } from 'vitest';
import { CATALOG } from './catalog.generated';
import { STARTER_GLYPHS } from './starter.generated';
import { POPULAR_ICONS, searchIcons, suggestFromName } from './search';
import { DEFAULT_PROJECT_ICON, FALLBACK_PROJECT_ICON, iconAsText, iconLabel, phosphorName } from '../projectIcon';

const names = new Set(CATALOG.map((r) => r[0]));

describe('the catalogue', () => {
  it('holds every Phosphor glyph, each with paths', () => {
    expect(CATALOG.length).toBeGreaterThan(1500);
    expect(CATALOG.every((r) => r[2].length > 0 && r[2].every((d) => d.startsWith('M')))).toBe(true);
  });

  it('has every popular name, once', () => {
    for (const n of POPULAR_ICONS) expect(names.has(n), n).toBe(true);
    expect(new Set(POPULAR_ICONS).size).toBe(POPULAR_ICONS.length);
  });

  it('bundles the two icons a project wears without choosing, matching the catalogue', () => {
    for (const value of [DEFAULT_PROJECT_ICON, FALLBACK_PROJECT_ICON]) {
      const name = phosphorName(value)!;
      expect(STARTER_GLYPHS[name]).toEqual(CATALOG.find((r) => r[0] === name)![2]);
    }
  });
});

describe('searchIcons', () => {
  it('puts the exact name first, then names starting with it, before tags', () => {
    const found = searchIcons(CATALOG, 'car', 20);
    expect(found[0]).toBe('car');
    expect(found.indexOf('car-profile')).toBeGreaterThan(0);
    const firstTagOnly = found.findIndex((n) => !n.split('-').some((p) => p.startsWith('car')));
    const lastNamed = found.map((n) => n.split('-').some((p) => p.startsWith('car'))).lastIndexOf(true);
    if (firstTagOnly !== -1) expect(lastNamed).toBeLessThan(firstTagOnly);
  });

  it('finds by a tag, not just the name', () => {
    expect(searchIcons(CATALOG, 'gym', 10)).toContain('barbell');
  });

  it('needs every word to match', () => {
    const found = searchIcons(CATALOG, 'arrow circle', 50);
    expect(found.length).toBeGreaterThan(0);
    for (const n of found.slice(0, 5)) expect(n).toMatch(/arrow/);
  });

  it('matches nothing for an empty query and honours the limit', () => {
    expect(searchIcons(CATALOG, '  ', 10)).toEqual([]);
    expect(searchIcons(CATALOG, 'a', 7)).toHaveLength(7);
  });
});

describe('suggestFromName', () => {
  it('reads the project name a word at a time', () => {
    expect(suggestFromName(CATALOG, 'Gym plan', 8)).toContain('barbell');
    expect(suggestFromName(CATALOG, 'Studio Launch', 8).length).toBeGreaterThan(0);
  });

  it('skips short words and suggests nothing for a blank name', () => {
    expect(suggestFromName(CATALOG, '', 8)).toEqual([]);
    expect(suggestFromName(CATALOG, 'a b c', 8)).toEqual([]);
  });
});

describe('icon values', () => {
  it('tells a Phosphor icon from an emoji', () => {
    expect(phosphorName('ph:rocket-launch')).toBe('rocket-launch');
    expect(phosphorName('🚀')).toBeUndefined();
    expect(phosphorName(undefined)).toBeUndefined();
  });

  it('shows an emoji as text and a Phosphor icon as nothing', () => {
    expect(iconAsText('🎨')).toBe('🎨');
    expect(iconAsText('ph:palette')).toBe('');
    expect(iconAsText(undefined)).toBe('');
  });

  it('names an icon for a button', () => {
    expect(iconLabel('rocket-launch')).toBe('Rocket launch');
  });
});
