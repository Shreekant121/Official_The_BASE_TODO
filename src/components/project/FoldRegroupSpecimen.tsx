/**
 * `/design`'s 29-1P9a section: a list folded into a spine (157) and the list
 * view regrouped (158), on pretend lists and tasks. Local state only —
 * nothing here reads or writes the store. It uses the real pieces: `Spine`
 * and the folded board's CSS (`.ag-board-grid--folds`, `screens.css`),
 * `GroupHeading`, the groups and their order (`lib/regroup.ts`) and the
 * regroup glide (`regroupGlide.ts`).
 */
import { useRef, useState } from 'react';
import { Icon, IconButton, MorphMenu, SoftButton } from '../../ui';
import { LIST_PANE_FILL, LIST_PANE_FLOOR, LIST_PANE_SHADOW, Spine } from './ListColumn';
import { GroupHeading } from './ListTable';
import { rememberRows, useRegroupGlide } from './regroupGlide';
import { DUE_GROUPS, SCORE_GROUPS, groupInto, type DueGroup, type GroupBy, type ScoreGroup } from '../../lib/regroup';
import { Z } from '../../lib/zLayers';

interface PretendList { id: string; title: string; done: number; rows: string[] }
const LISTS: PretendList[] = [
  { id: 'launch', title: 'Launch week', done: 2, rows: ['Draft the invite list', 'Book the venue call', 'Write the teaser post'] },
  { id: 'ideas', title: 'Ideas parking', done: 0, rows: ['A podcast series?', 'Partner with the café'] },
  { id: 'admin', title: 'Admin', done: 1, rows: ['Renew the domain', 'File the GST return'] },
];

interface PretendTask { id: string; title: string; list: string; due: DueGroup; dueWords: string; score: ScoreGroup; n: number }
const TASKS: PretendTask[] = [
  { id: 'spec-1', title: 'Open the current account', list: 'Admin', due: 'overdue', dueWords: '2 days late', score: 'alert', n: 41 },
  { id: 'spec-2', title: 'Fix the press kit link', list: 'Launch week', due: 'today', dueWords: 'today', score: 'emergency', n: 38 },
  { id: 'spec-3', title: 'Draft the invite list', list: 'Launch week', due: 'today', dueWords: 'today', score: 'hot', n: 33 },
  { id: 'spec-4', title: 'Book the venue call', list: 'Launch week', due: 'tomorrow', dueWords: 'tomorrow', score: 'hot', n: 27 },
  { id: 'spec-5', title: 'File the GST return', list: 'Admin', due: 'week', dueWords: 'in 3 days', score: 'warm', n: 19 },
  { id: 'spec-6', title: 'Partner with the café', list: 'Ideas parking', due: 'none', dueWords: '—', score: 'rest', n: 6 },
];

const CHOICES: readonly (readonly [GroupBy, string])[] = [['list', 'By list'], ['due', 'By due date'], ['score', 'By Score']];
const SHORT: Record<GroupBy, string> = { list: 'List', due: 'Due date', score: 'Score' };

const PANE = {
  borderRadius: 'var(--r-card)', overflow: 'hidden',
  backgroundImage: LIST_PANE_FILL, backgroundColor: LIST_PANE_FLOOR, boxShadow: LIST_PANE_SHADOW,
} as const;

export function FoldRegroupSpecimen() {
  const [folded, setFolded] = useState<string[]>(['ideas']);
  const [by, setBy] = useState<GroupBy>('list');
  const [menuOpen, setMenuOpen] = useState(false);
  const table = useRef<HTMLDivElement>(null);
  useRegroupGlide(table, by);
  const toggle = (id: string) => setFolded((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]));

  const groups: { key: string; label: string; ink: string | null; tasks: PretendTask[] }[] = by === 'list'
    ? LISTS.map((l) => ({ key: l.id, label: l.title, ink: null, tasks: TASKS.filter((t) => t.list === l.title) })).filter((g) => g.tasks.length > 0)
    : (by === 'due'
      ? groupInto(DUE_GROUPS, TASKS, (t) => t.due, (a, b) => b.n - a.n)
      : groupInto(SCORE_GROUPS, TASKS, (t) => t.score, (a, b) => b.n - a.n)
    ).map(({ spec, tasks }) => ({ key: spec.key, label: spec.label, ink: spec.ink, tasks }));

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-8)' }}>
      <div className={['ag-board-grid', folded.length > 0 && 'ag-board-grid--folds'].filter(Boolean).join(' ')}>
        {LISTS.map((l) => (
          <div key={l.id}>
            {folded.includes(l.id) ? (
              <div data-spine="" style={PANE}>
                <Spine
                  listId={l.id} listTitle={l.title} done={l.done} total={l.rows.length}
                  pct={Math.round((l.done / l.rows.length) * 100)} onOpen={toggle}
                />
              </div>
            ) : (
              <div style={{ ...PANE, display: 'grid', gap: 'var(--sp-3)', padding: 'var(--sp-5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                  <IconButton size="sm" variant="ghost" label={`Fold ${l.title} away`} onClick={() => toggle(l.id)}>
                    <Icon name="chevron-left" size={16} />
                  </IconButton>
                  <span style={{ font: 'var(--type-title)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>{l.title}</span>
                  <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)' }}>{l.done}/{l.rows.length}</span>
                </div>
                {l.rows.map((r) => (
                  <div key={r} style={{ padding: 'var(--sp-4) var(--sp-5)', borderRadius: 'var(--r-xs)', backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)', font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}>
                    {r}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {folded.length > 0 && [0, 1, 2, 3].map((i) => <span key={i} className="ag-board-fill" aria-hidden />)}
      </div>

      <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
        <div>
          <MorphMenu
            align="start" width={220} open={menuOpen} onOpenChange={setMenuOpen} portal zIndex={Z.dropdown}
            trigger={
              <SoftButton size="sm" icon={<Icon name={by === 'due' ? 'calendar' : by === 'score' ? 'flame' : 'list'} size={15} />}>
                <span style={{ color: 'var(--fg-3)' }}>Group:</span>
                {SHORT[by]}
                <Icon name="chevron-down" size={14} style={{ color: 'var(--fg-3)' }} />
              </SoftButton>
            }
            items={CHOICES.map(([value, label]) => ({
              value,
              label,
              icon: <Icon name={value === 'due' ? 'calendar' : value === 'score' ? 'flame' : 'list'} size={18} />,
              meta: by === value ? <Icon name="check" size={14} /> : undefined,
              onSelect: () => { if (value !== by) { rememberRows(table.current); setBy(value); } },
            }))}
          />
        </div>
        <div ref={table} style={{ ...PANE, display: 'grid', gap: 'var(--sp-6)', padding: 'var(--pad-card)' }}>
          {groups.map((g) => (
            <section key={`${by}:${g.key}`} style={{ display: 'grid', gap: 'var(--sp-3)' }}>
              <GroupHeading label={g.label} ink={g.ink} count={g.tasks.length} />
              {g.tasks.map((t) => (
                <div
                  key={t.id}
                  data-dust={`task:${t.id}`}
                  style={{
                    display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'center', gap: 'var(--sp-5)',
                    padding: 'var(--sp-4) var(--sp-6)', borderRadius: 'var(--r-xs)',
                    backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
                  }}
                >
                  <span style={{ display: 'grid', minWidth: 0 }}>
                    <span style={{ font: 'var(--type-body)', color: 'var(--fg-1)' }}>{t.title}</span>
                    {by !== 'list' && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{t.list}</span>}
                  </span>
                  <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-3)' }}>{t.dueWords}</span>
                  <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-2)', minWidth: 28, textAlign: 'right' }}>{t.n}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
