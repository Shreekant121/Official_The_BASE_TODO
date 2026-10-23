/**
 * A project's icon as he sees it everywhere the project has a tile — the
 * card, the project's header, a side-by-side pane, the Dashboard's project
 * block (29-1P8a2, idea 150 on idea 80's two layers). His call, 2026-10-13:
 * **a white icon on frosted glass, with the cover's main colour glowing
 * faintly behind it** — no colour to pick, since projects have none (OPT-4).
 *
 * The colour is the cover's: a made cover's main ink (`coverGlow`), or, when
 * he has a photo, the photo's own colour (`useCoverColour`, ideas 46 + 68).
 * So changing the cover recolours the icon, which is the point — the two
 * read as one thing.
 *
 * A row in a list (a picker, a dialog) shows the bare glyph with `AppIcon`
 * instead: at 16px the two layers are mush.
 */
import { LayeredIcon } from '../ui';
import { useProjectGlow, type IconSubject } from '../lib/projectIcons/useProjectGlow';
import AppIcon from './AppIcon';

export default function ProjectIcon({ project, size, className }: { project: IconSubject; size: number; className?: string }) {
  const glow = useProjectGlow(project);
  return (
    <LayeredIcon
      size={size}
      colour={glow}
      className={className}
      /* The glyph is drawn at the layered icon's own share (`.ag-licon-glyph svg`); this is its box. */
      icon={<AppIcon icon={project.icon} size={Math.round(size * 0.47)} />}
    />
  );
}
