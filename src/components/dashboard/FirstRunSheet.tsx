/**
 * The first run (29-1c4): a new account's three questions, over the
 * Dashboard the first time it opens. The wording, the choices and what each
 * adds are `lib/dashboard/firstRun.ts`, the draft he approved on 2026-10-21;
 * this file only draws it and applies the answers.
 *
 * Shown while the Dashboard document says `firstRun: 'ask'` — set only where
 * the cloud had no Dashboard at all — and the account has no projects of its
 * own. An account that already has projects is not new, whatever the flag
 * says, so the flag is dropped instead of asking.
 *
 * Answering builds the layout and the weekly hours in one store write, and
 * makes his picked projects through `addProject` (empty, each with the cover
 * its id rolls). Skip keeps the default layout and hours. Either ends it on
 * every device: the flag is in the synced document.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Dialog, Icon, Input, SoftButton, SoftToggle, WhiteButton } from '../../ui';
import { useStore } from '../../store/useStore';
import { useDashboardStore } from '../../store/useDashboardStore';
import {
  MAX_PROJECT_NAME, MAX_STARTER_PROJECTS, NORMAL_DAY, PROJECT_IDEAS, SEE_FIRST, SEE_FIRST_MAX,
  starterLayout, starterProjectNames, starterWeekly,
  type NormalDay, type SeeFirst,
} from '../../lib/dashboard/firstRun';
import { Z } from '../../lib/zLayers';
import { Label } from './dialogs';

export default function FirstRun() {
  const ask = useDashboardStore((s) => s.firstRun === 'ask');
  const hasProjects = useStore((s) => s.projects.length > 0);

  useEffect(() => {
    if (ask && hasProjects) useDashboardStore.getState().finishFirstRun();
  }, [ask, hasProjects]);

  if (!ask || hasProjects) return null;
  return <FirstRunSheet />;
}

function FirstRunSheet() {
  const [see, setSee] = useState<SeeFirst[]>([]);
  const [day, setDay] = useState<NormalDay | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [typedOwn, setTypedOwn] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const toggleSee = (id: SeeFirst) => {
    setSee((s) => {
      if (s.includes(id)) return s.filter((x) => x !== id);
      /* A third pick replaces the second, so the first — the lead — stays. */
      return s.length < SEE_FIRST_MAX ? [...s, id] : [s[0], id];
    });
  };
  const toggleName = (name: string) => {
    setNames((n) => (n.includes(name) ? n.filter((x) => x !== name) : n.length < MAX_STARTER_PROJECTS ? [...n, name] : n));
  };
  const addTyped = () => {
    const [name] = starterProjectNames([typed]);
    if (!name) return;
    const known = [...PROJECT_IDEAS, ...typedOwn].find((x) => x.toLowerCase() === name.toLowerCase());
    if (!known) setTypedOwn((o) => [...o, name]);
    const pick = known ?? name;
    setNames((n) => (n.includes(pick) || n.length >= MAX_STARTER_PROJECTS ? n : [...n, pick]));
    setTyped('');
  };

  const build = () => {
    if (!day) {
      setError('Pick what a normal day looks like first.');
      return;
    }
    const { addProject } = useStore.getState();
    const made = starterProjectNames(names).map((name) => addProject({ name }));
    const blocks = starterLayout({ see }, made[0]?.id ?? null, () => crypto.randomUUID());
    useDashboardStore.getState().finishFirstRun({ blocks, weekly: starterWeekly(day) });
  };
  const skip = () => useDashboardStore.getState().finishFirstRun();

  const own = [...PROJECT_IDEAS, ...typedOwn];
  const nothingYet = names.length === 0;

  return (
    <Dialog
      open
      onClose={() => {}}
      width={620}
      label="Set up your Dashboard"
      closeOnEscape={false}
      closeOnBackdrop={false}
      zIndex={Z.modal}
      style={{ gap: 0, padding: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}
    >
      <div className="dash-first-run ag-scroll ag-fade" style={{ display: 'grid', gap: 'var(--sp-8)', padding: 'var(--pad-sheet)', maxHeight: '86vh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)' }}>
          <div style={{ display: 'grid', gap: 'var(--sp-2)', flex: 1, minWidth: 0 }}>
            <h2 style={{ font: 'var(--type-title)', fontSize: 'var(--text-xl)', color: 'var(--fg-1)' }}>Let's set up your Dashboard</h2>
            <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
              Three questions. You can change anything later in Edit.
            </p>
          </div>
          <SoftButton size="sm" onClick={skip}>Skip</SoftButton>
        </header>

        <Question n={1} hint="pick up to two" title="What do you want to see first each day?" sub="The first answer gets the biggest block.">
          {SEE_FIRST.map((c) => (
            <Pick key={c.id} on={see.includes(c.id)} lead={see[0] === c.id} label={c.label} adds={c.adds} onToggle={() => toggleSee(c.id)} />
          ))}
        </Question>

        <Question n={2} hint="pick one" title="What does a normal day look like?" sub="Sets your hours per day. Change them any day on Hours today.">
          {NORMAL_DAY.map((c) => (
            <Pick key={c.id} on={day === c.id} label={c.label} adds={c.adds} onToggle={() => { setDay(c.id); setError(null); }} />
          ))}
        </Question>

        <Question n={3} hint="pick any, or type your own" title="What are you working on?" sub="Each one becomes a project with its own cover.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
            {own.map((name) => (
              <SoftToggle
                key={name}
                size="sm"
                className="dash-pick"
                pressed={names.includes(name)}
                onPressedChange={() => toggleName(name)}
                icon={names.includes(name) ? <Icon name="check" size={14} /> : undefined}
              >
                {name}
              </SoftToggle>
            ))}
            <SoftToggle
              size="sm"
              className="dash-pick"
              pressed={nothingYet}
              onPressedChange={() => setNames([])}
              icon={nothingYet ? <Icon name="check" size={14} /> : undefined}
            >
              Nothing yet
            </SoftToggle>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); addTyped(); }}
            style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}
          >
            <Input
              size="sm"
              value={typed}
              maxLength={MAX_PROJECT_NAME}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type a name"
              aria-label="Type a project name"
            />
            <SoftButton size="sm" type="submit" icon={<Icon name="plus" size={14} />}>Add</SoftButton>
          </form>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
            {nothingYet ? 'No projects; a Jot it down note instead.' : 'The first one gets a Project progress block.'}
          </span>
        </Question>

        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
          {error && <span role="alert" style={{ font: 'var(--type-caption)', color: 'var(--job-coral-text)', marginRight: 'auto' }}>{error}</span>}
          <WhiteButton onClick={build}>Build my Dashboard</WhiteButton>
        </footer>
      </div>
    </Dialog>
  );
}

function Question({ n, hint, title, sub, children }: { n: number; hint: string; title: string; sub: string; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 'var(--sp-4)' }} aria-label={title}>
      <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
        <Label>{n} of 3 · {hint}</Label>
        <h3 style={{ font: 'var(--type-label)', fontSize: 'var(--text-lg)', color: 'var(--fg-1)' }}>{title}</h3>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{sub}</span>
      </div>
      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>{children}</div>
    </section>
  );
}

/** One choice: the answer, pressed in and lime when picked (chosen is lime's job), and what it adds. */
function Pick({ on, lead, label, adds, onToggle }: { on: boolean; lead?: boolean; label: string; adds: string; onToggle: () => void }) {
  return (
    <SoftToggle
      pressed={on}
      onPressedChange={onToggle}
      className="dash-pick dash-pick--row"
      icon={<Icon name={on ? 'circle-check' : 'circle'} size={18} />}
    >
      <span style={{ display: 'grid', gap: 2, textAlign: 'left', minWidth: 0, flex: 1 }}>
        <span>{label}{lead && <span className="dash-pick-lead"> · leads</span>}</span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', whiteSpace: 'normal' }}>{adds}</span>
      </span>
    </SoftToggle>
  );
}
