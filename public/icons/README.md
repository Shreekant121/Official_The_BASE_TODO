# Custom icons

Drop custom icon image files in this folder. They're served at `/icons/<filename>`.

Conventions:

- Format: SVG preferred (crisp at any size); PNG/WEBP also fine.
- Shape: square canvas, transparent background, ~128×128px (or larger, same aspect ratio).
- Filename: kebab-case, e.g. `rocket-badge.svg`.

After adding a file here, tell the agent its filename and where you want to use it (e.g. "use rocket-badge.svg as the icon for the Launch project"). It will register it in `src/lib/customIcons.ts` and wire it into the picker/relevant UI — no other setup needed on your end.
