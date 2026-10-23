/**
 * What a project's `icon` field holds, and the glyph a new project starts with.
 *
 * Shared by the New Project sheet and Atlas's `create_project`, which runs in
 * Node under `mcp/` and cannot import a component. This file held the six
 * project colours too until OPT-4 removed project colours from the app.
 *
 * THREE KINDS OF VALUE (29-1P8a2, idea 150). Since then a project wears a
 * white Phosphor icon, stored as `ph:<name>` (`ph:rocket-launch`). An emoji
 * he chose before keeps showing until he changes it — his call — so a bare
 * emoji is still a valid value, and so is a `CUSTOM_ICONS` key
 * (`lib/customIcons.ts`). `AppIcon` draws all three.
 */

export const PHOSPHOR_PREFIX = 'ph:';

/** A new project's icon. Bundled (`starter.generated.ts`), so it never waits for the catalogue. */
export const DEFAULT_PROJECT_ICON = 'ph:rocket-launch';

/** What a project with no icon at all shows (it was 📋). Bundled too. */
export const FALLBACK_PROJECT_ICON = 'ph:clipboard-text';

export function phosphorIcon(name: string): string {
  return PHOSPHOR_PREFIX + name;
}

/** The Phosphor name inside a `ph:` value, or undefined for an emoji or a custom key. */
export function phosphorName(value: string | undefined): string | undefined {
  return value && value.startsWith(PHOSPHOR_PREFIX) ? value.slice(PHOSPHOR_PREFIX.length) : undefined;
}

/**
 * The icon as text, for the places that can only show a string (a native
 * `<select>`'s options): an emoji is itself, a Phosphor icon is nothing —
 * "ph:rocket-launch" in a list name would be worse than no icon.
 */
export function iconAsText(value: string | undefined): string {
  if (!value) return '';
  return value.startsWith(PHOSPHOR_PREFIX) ? '' : value;
}

/** "rocket-launch" → "Rocket launch", for a button's name and a tooltip. */
export function iconLabel(name: string): string {
  const words = name.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
