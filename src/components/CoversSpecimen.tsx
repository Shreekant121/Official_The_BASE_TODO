/**
 * `/design`'s covers (29-1P8a, idea 149): the six styles side by side on a
 * pretend project, with the colours switch and Shuffle the project sheet
 * has; and its project icons (29-1P8a2, idea 150). Nothing here touches a
 * real project.
 */
import { useState } from 'react';
import { Card, Icon, PROJECT_COVER_RATIO, SegmentedControl, SoftButton } from '../ui';
import {
  COVER_COLOURS, COVER_COLOURS_LABEL, COVER_KINDS, COVER_KIND_LABEL, castLight, coverInks, coverLight, resolveCover,
  shuffleSeed, type CoverColours,
} from '../lib/projectCover';
import { DEFAULT_PROJECT_ICON } from '../lib/projectIcon';
import { MadeCover } from './ProjectCover';
import ProjectIcon from './ProjectIcon';
import { FolderTiles } from './FolderParts';
import { JumpCard } from './JumpBackRow';
import type { Project } from '../store/useStore';

const PRETEND = { id: 'specimen', name: 'Studio Launch', icon: DEFAULT_PROJECT_ICON };

export function CoversSpecimen() {
  const [seed, setSeed] = useState(7);
  const [colours, setColours] = useState<CoverColours>('shuffle');
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <SegmentedControl
            size="sm"
            look="soft"
            aria-label="Cover colours"
            options={COVER_COLOURS.map((c) => ({ value: c, label: COVER_COLOURS_LABEL[c] }))}
            value={colours}
            onChange={(v) => setColours(v as CoverColours)}
          />
          <SoftButton size="sm" icon={<Icon name="shuffle" size={15} />} onClick={() => setSeed((s) => shuffleSeed(s, Math.random))}>
            Shuffle
          </SoftButton>
        </div>
        <div className="ag-licon-host" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--sp-5)' }}>
          {COVER_KINDS.filter((k) => k !== 'none').map((kind) => (
            <div key={kind} style={{ display: 'grid', gap: 'var(--sp-3)' }}>
              <div
                style={{
                  position: 'relative', aspectRatio: PROJECT_COVER_RATIO, overflow: 'hidden',
                  borderRadius: 'var(--r-md)', backgroundColor: 'var(--void-1)', boxShadow: 'var(--glass-rim-1)',
                }}
              >
                <MadeCover project={PRETEND} style={{ ...resolveCover(PRETEND.id, { seed, colours }), kind }} />
              </div>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{COVER_KIND_LABEL[kind]}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/**
 * Icons only from the bundled pair, so the shot never waits for the
 * catalogue: each glows in its cover's main colour, whatever the colours
 * switch says; a project with no icon shows the clipboard, and an emoji
 * chosen before stays, on the same glass.
 */
const ICON_SAMPLES = [
  { label: 'Any colour', project: { id: 'icon-a', icon: DEFAULT_PROJECT_ICON, cover: { seed: 7 } } },
  { label: 'Another roll', project: { id: 'icon-b', icon: DEFAULT_PROJECT_ICON, cover: { seed: 12 } } },
  { label: 'My tint', project: { id: 'icon-c', icon: DEFAULT_PROJECT_ICON, cover: { seed: 7, colours: 'tint' as const } } },
  { label: 'Greys', project: { id: 'icon-d', icon: DEFAULT_PROJECT_ICON, cover: { seed: 7, colours: 'grey' as const } } },
  { label: 'No icon yet', project: { id: 'icon-e', icon: undefined, cover: { seed: 3 } } },
  { label: 'An emoji kept', project: { id: 'icon-f', icon: '🎨', cover: { seed: 5 } } },
];

export function ProjectIconsSpecimen() {
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-7)' }}>
          {ICON_SAMPLES.map(({ label, project }) => (
            <div key={label} className="ag-licon-host" style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-3)' }}>
              <ProjectIcon project={project} size={56} />
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{label}</span>
            </div>
          ))}
        </div>
        <div className="ag-licon-host" style={{ display: 'flex', alignItems: 'end', gap: 'var(--sp-6)' }}>
          {[32, 36, 48, 56, 64].map((size) => (
            <div key={size} style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-3)' }}>
              <ProjectIcon project={ICON_SAMPLES[0].project} size={size} />
              <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)' }}>{size}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Focus's light in a few pretend covers, and a task in no project (Focus's own teal). */
const LIGHT_SAMPLES: { label: string; light?: readonly [string, string] }[] = [
  { label: 'Any colour', light: coverLight(coverInks(7, 'shuffle')) },
  { label: 'Another roll', light: coverLight(coverInks(12, 'shuffle')) },
  { label: 'My tint', light: coverLight(coverInks(7, 'tint')) },
  { label: 'Greys', light: coverLight(coverInks(7, 'grey')) },
  { label: 'No project', light: undefined },
];

/**
 * `/design`'s Focus in its cover's colours (29-1P11c, ideas 46 and 68): each
 * box is a real Focus page backdrop, its pool in the cover's main colour,
 * with a running stage casting both. Just the numbers: no rail under them.
 */
export function FocusLightSpecimen() {
  return (
    <Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--sp-5)' }}>
        {LIGHT_SAMPLES.map(({ label, light }) => (
          <div key={label} style={{ display: 'grid', gap: 'var(--sp-3)' }}>
            <div
              className="ag-page ag-page--focal"
              data-cover-light=""
              style={{
                height: 200, minHeight: 0, display: 'grid', placeItems: 'center', overflow: 'hidden',
                borderRadius: 'var(--r-md)', boxShadow: 'var(--glass-rim-1)',
                ['--cover-light' as string]: light ? light[0] : 'var(--job-teal)',
              }}
            >
              <div
                style={{
                  display: 'grid', justifyItems: 'center', gap: 'var(--sp-2)', padding: 'var(--sp-5) var(--sp-7)',
                  borderRadius: 'var(--r-md)', backgroundImage: 'var(--glass-fill-2)',
                  boxShadow: `var(--glass-shadow-pane), ${light ? castLight(light) : 'var(--job-teal-shine-md)'}`,
                }}
              >
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>Studio Launch</span>
                <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-3xl)', fontWeight: 'var(--weight-bold)', color: 'var(--fg-1)' }}>
                  24:13
                </span>
              </div>
            </div>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Pretend projects for the folders: each with its own cover style, none of them real. */
const INSIDE: Project[] = ([
  ['Studio Launch', { kind: 'pattern', pattern: 'mesh', seed: 4 }],
  ['Hiring', { kind: 'pattern', pattern: 'stripes', seed: 7 }],
  ['Legal', { kind: 'name', seed: 3 }],
  ['Money', { kind: 'aurora', seed: 11 }],
  ['Operations', { kind: 'pattern', pattern: 'waves', seed: 21 }],
  ['Press', { kind: 'pattern', pattern: 'dots', seed: 30 }],
] as const).map(([name, cover], i) => ({
  id: `specimen-in-${i}`, name, description: '', cover: { ...cover }, icon: DEFAULT_PROJECT_ICON, createdAt: 0, order: i,
}));

/**
 * `/design`'s folders and Jump back in (29-1P8c, ideas 153 and 154): a
 * folder's cover with one, two, three and six projects inside, and three
 * Jump back in cards. Pretend projects; pressing a card goes nowhere.
 */
export function FoldersSpecimen() {
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--sp-5)' }}>
          {[1, 2, 3, 6].map((n) => (
            <div key={n} style={{ display: 'grid', gap: 'var(--sp-3)' }}>
              <div
                style={{
                  position: 'relative', aspectRatio: PROJECT_COVER_RATIO, overflow: 'hidden',
                  borderRadius: 'var(--r-md)', boxShadow: 'var(--glass-rim-1)',
                }}
              >
                <FolderTiles projects={INSIDE.slice(0, n)} />
              </div>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                {n} {n === 1 ? 'project' : 'projects'} inside
              </span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <JumpCard project={INSIDE[0]} where="Launch Week list · at “Draft the invite list”" when="12 min ago" onClick={() => {}} />
          <JumpCard project={INSIDE[2]} where="Contracts list" when="yesterday" onClick={() => {}} />
          <JumpCard project={INSIDE[3]} where="" when="Mon" onClick={() => {}} />
        </div>
      </div>
    </Card>
  );
}
