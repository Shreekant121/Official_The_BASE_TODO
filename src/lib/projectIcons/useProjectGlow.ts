/**
 * The colour behind a project's icon (29-1P8a2, idea 150): the cover's main
 * colour — a photo's own (`useCoverColour`, ideas 46 + 68), or a made
 * cover's main ink (`coverGlow`). Grey while a photo is being read.
 */
import type { Project } from '../../store/useStore';
import { coverGlow, coverInks, coverLight, resolveCover } from '../projectCover';
import { useCoverColour, useCoverColours } from '../covers/useCoverColour';
import { GREY_GLOW } from '../covers/coverColour';

export type IconSubject = Pick<Project, 'id' | 'icon' | 'imageUrl' | 'cover'>;

export function useProjectGlow(project: IconSubject): string {
  const photo = useCoverColour(project.imageUrl || undefined);
  if (project.imageUrl) return photo ?? GREY_GLOW;
  const cover = resolveCover(project.id, project.cover);
  return coverGlow(coverInks(cover.seed, cover.colours));
}

/**
 * The project's two cover colours (29-1P11c): its photo's, or its made
 * cover's two inks — every project has one, style "None" included, as its
 * icon's glow does. Grey while a photo is being read; undefined with no
 * project, and the caller keeps its own colour (Focus's teal).
 */
export function useProjectLight(project: IconSubject | undefined): readonly [string, string] | undefined {
  const photo = useCoverColours(project?.imageUrl || undefined);
  if (!project) return undefined;
  if (project.imageUrl) return photo ?? [GREY_GLOW, GREY_GLOW];
  const cover = resolveCover(project.id, project.cover);
  return coverLight(coverInks(cover.seed, cover.colours));
}
