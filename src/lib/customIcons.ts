/**
 * Registry for custom (non-emoji) icon assets. Drop image files into
 * `public/icons/` (see the README there for conventions), then add an entry
 * below — `Project.icon` can store either a literal emoji (the original
 * behavior) or one of these registry `key`s. Everything that renders a
 * project icon goes through `AppIcon` (`src/components/AppIcon.tsx`), which
 * resolves a `key` to its image automatically, so registering an icon here
 * is the only step needed to make it choosable and renderable everywhere.
 */
export interface CustomIconDef {
  key: string;
  src: string;
  label: string;
}

export const CUSTOM_ICONS: CustomIconDef[] = [
  // Example, once a file exists at public/icons/rocket-badge.svg:
  // { key: 'rocket-badge', src: '/icons/rocket-badge.svg', label: 'Rocket Badge' },
];

export function resolveIconSrc(value?: string): string | undefined {
  if (!value) return undefined;
  return CUSTOM_ICONS.find((i) => i.key === value)?.src;
}

export function isCustomIconValue(value?: string): boolean {
  return !!value && CUSTOM_ICONS.some((i) => i.key === value);
}
