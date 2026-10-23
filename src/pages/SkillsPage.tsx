/**
 * Skills — how Atlas knows how to do things (item 12, `design-system/screens/skills.html`).
 *
 * WHAT THIS SCREEN IS LOOKING AT
 * -------------------------------
 * Folders on Shreekant's laptop, served by Atlas over Tailscale — the same
 * arrangement `/catalog` has and for the same reasons, so this file follows it
 * closely on purpose rather than inventing a second way to draw the same kind
 * of thing. Nothing here is in the browser except while it is on screen.
 *
 * A skill is **a folder with a `SKILL.md` in it**, in the open Agent Skills
 * format, unchanged (DESIGN.md §7.2). That is the decision the whole screen
 * rests on: `npx skills add owner/repo --skill=name` drops a folder into the
 * directory named in the footer, and it appears here. Every skill written for
 * Claude works for Atlas and the other way round.
 *
 * THE DESCRIPTION IS THE RETRIEVAL KEY, AND THE SCREEN HAS TO SAY SO
 * -------------------------------------------------------------------
 * Only the names and descriptions are in Atlas's prompt; a folder is opened
 * when its description matches the question, and not before — §4.4's
 * just-in-time rule, applied to procedures instead of facts. So a skill with a
 * vague description is a folder Atlas cannot see, and the header tile counts
 * the ones that have never been loaded rather than leaving that to be noticed.
 * `skills.html` puts exactly that sentence on the tile: *"a description that
 * never matches is a folder Atlas cannot see."*
 *
 * TWO PLACES THIS DELIBERATELY GOES FURTHER THAN THE MOCKUP
 * ----------------------------------------------------------
 * **The instructions are editable here.** `skills.html`'s overflow menu routes
 * *"Edit the instructions"* to Notepad on the laptop. Shreekant's call, put to
 * him with the alternative: edit in the app, the way `/catalog` already edits
 * a note. The file stays the truth either way — Notepad still works, and an
 * edit made there reports itself as `outside` — and what it buys is that a
 * skill can be fixed from the tablet, which is the device he actually holds
 * and the one with no Notepad on it.
 *
 * **`uses` counts what ATLAS loaded, never what this screen showed.** The HTTP
 * route reads a skill without counting it and only the model's `read_skill`
 * increments, which is `routes/catalog.ts`'s decision transplanted: it is what
 * makes "used 12×" worth printing. Browsing your own skills on a Sunday would
 * otherwise turn the number into a measure of how much you have been reading.
 *
 * WHAT THE MOCKUP DRAWS THAT IS NOT HERE, AND WHY
 * ------------------------------------------------
 * `skills.html` gives every skill a `reach` row — *"tasks · mail · stops at
 * the door"* — naming which drawers it can open. **Nothing in Atlas knows
 * that.** A skill is instructions; it inherits the same tool surface as every
 * other turn and cannot widen or narrow it, which is exactly what §7.2 means
 * by calling skills the safe half of "write its own tools". Drawing a
 * per-skill permission list would state a boundary that does not exist, in the
 * one place someone would go to check one. The sentence the mockup puts under
 * that row is true and is kept; the row itself is not.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BlurAcross, Button, GelButton, Icon, IconButton, Input, LitLine, litSafe, MetaKicker, MiniNav, MorphMenu, SegmentedControl, SoftButton,
  Bone, Skeleton, SoftToggle, StatusPill, Switch, Textarea, Toast, useArrival, useMedia, WhiteButton, WIDE, type IconName,
} from '../ui';
import { MemoryWaiting } from '../components/MemoryWaiting';
import { RailMark } from '../components/BrandMark';
import { useNavModel } from '../components/navModel';
import { useAtlasStore } from '../lib/atlas/atlasStore';
import {
  loadSkill,
  loadSkillFile,
  loadSkills,
  removeSkill,
  storeSkill,
  switchSkill,
  useMemorySource,
} from '../lib/atlas/memorySource';
import {
  AtlasMemoryUnavailable,
  type AtlasSkill,
  type AtlasSkillHeader,
  type AtlasSkillsIndex,
} from '../lib/atlas/client';
import { devSkillsFixture } from '../lib/devSkillsFixture';
import { Z } from '../lib/zLayers';

/** `skills.html`'s column, which is `/catalog`'s and `/trash`'s. */
const COLUMN_PX = 1140;

/** Where the index docks beside the skill instead of sliding over it. The mockup's number. */
const DOCKED = '(min-width: 1080px)';

/*
 * "Automatic" and "On demand" rather than On and Off, and the rename is the
 * point rather than a tidy-up.
 *
 * Off used to mean dead: the folder sat there and nothing could reach it. Now
 * that the composer has `/`, every skill is reachable — the switch only
 * decides *who decides*. Automatic means Atlas may pick it itself, and pays
 * for it by carrying its description in every prompt. On demand means it costs
 * nothing until Shreekant types `/` and names it.
 *
 * Leaving the labels as On/Off would have told him, in his own words, that
 * thirty-five of his skills were dead. They are one keystroke away.
 */
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'on', label: 'Automatic' },
  { value: 'off', label: 'On demand' },
];

type FilterId = 'all' | 'on' | 'off';

interface ToastPayload {
  icon: IconName;
  title: string;
  detail?: string;
}

/** `2026-09-04T…` → `4 Sep`. `/catalog`'s format, so two screens of files agree. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function describeAuthor(skill: AtlasSkillHeader): string {
  const when = shortDate(skill.updatedAt);
  /* `outside` is the *usual* answer here, unlike in the catalog — a skill
     normally arrives by being installed or copied in — so it reads as a
     provenance rather than as a correction. */
  if (skill.author === 'outside') return `installed · ${when}`;
  return `written ${skill.author === 'you' ? 'here' : 'by Atlas'} · ${when}`;
}

function describeUses(skill: AtlasSkillHeader): string {
  if (skill.lastUsedAt === null) return 'never loaded';
  return `used ${skill.uses}× · last ${shortDate(skill.lastUsedAt)}`;
}

export default function SkillsPage() {
  const nav = useNavModel();
  const wide = useMedia(WIDE);
  const docked = useMedia(DOCKED);

  const status = useAtlasStore((s) => s.status);
  const probe = useAtlasStore((s) => s.probe);
  /* BIG-4: the laptop when it is awake, the cloud copy when it is asleep. */
  const source = useMemorySource();

  const [index, setIndex] = useState<AtlasSkillsIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<{ message: string; tooOld: boolean } | null>(null);

  const [currentName, setCurrentName] = useState<string | null>(null);
  /** The last skill fetched, **with the name it was fetched for** — `/catalog`'s keying. */
  const [fetched, setFetched] = useState<AtlasSkill | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [listOpen, setListOpen] = useState(false);

  /** Which file of the folder is open. `0` is always `SKILL.md`. */
  const [openFile, setOpenFile] = useState(0);
  const [fileText, setFileText] = useState<{ file: string; text: string } | null>(null);

  const [editing, setEditing] = useState(false);
  const [draftBody, setDraftBody] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastPayload | null>(null);

  const fixture = useMemo(() => devSkillsFixture(), []);

  /* 29-1P14d2, idea 116: `/catalog`'s waiting, for the same laptop and the
     same reasons — placeholders while the probe or the read is on its way,
     the skills fading in over them. */
  const waiting =
    problem === null && status !== 'unconfigured' && (status === 'unknown' || (source !== null && loading));
  const arrived = useRef<HTMLDivElement>(null);
  useArrival(arrived, index !== null);

  useEffect(() => {
    void probe();
  }, [probe]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  /* Leaving a skill mid-edit must not carry the draft to the next one, and a
     supporting file open on one folder means nothing in the next. Both done
     where the selection changes rather than in an effect on it. */
  const selectSkill = useCallback((name: string | null) => {
    setCurrentName(name);
    setEditing(false);
    setOpenFile(0);
    setFileText(null);
  }, []);

  const load = useCallback(async () => {
    if (fixture !== null) {
      setIndex(fixture.index);
      setCurrentName((cur) => cur ?? fixture.index.skills[0]?.name ?? null);
      setLoading(false);
      return;
    }
    if (source === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await loadSkills(source);
      setIndex(next);
      setProblem(null);
      // Keep the selection where it still exists, so a reload after a save
      // does not throw him back to the top of the list.
      setCurrentName((cur) =>
        cur !== null && next.skills.some((skill) => skill.name === cur) ? cur : (next.skills[0]?.name ?? null),
      );
    } catch (err) {
      setIndex(null);
      setProblem(
        err instanceof AtlasMemoryUnavailable
          ? { message: err.message, tooOld: err.tooOld }
          : { message: err instanceof Error ? err.message : String(err), tooOld: false },
      );
    } finally {
      setLoading(false);
    }
  }, [source, fixture]);

  /* Deferred out of the effect body for `/catalog`'s reason: `load` sets state
     before its first await, and a setState inside an effect is a second render
     for something the first already knew. */
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => {
      if (live) void load();
    });
    return () => {
      live = false;
    };
  }, [load]);

  /* The instructions, fetched only for the skill being looked at — the same
     rule Atlas itself follows, for the same reason. */
  useEffect(() => {
    if (currentName === null || fixture !== null || source === null) return;

    const controller = new AbortController();
    void (async () => {
      try {
        setFetched(await loadSkill(source, currentName, controller.signal));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setFetched(null);
      }
    })();
    return () => controller.abort();
  }, [source, currentName, fixture]);

  const skill: AtlasSkill | null =
    currentName === null
      ? null
      : fixture !== null
        ? (fixture.bodies[currentName] ?? null)
        : fetched !== null && fetched.name === currentName
          ? fetched
          : null;

  /** The supporting file whose tab is open, or `null` for `SKILL.md`. */
  const openFileName = skill === null || openFile === 0 ? null : (skill.files[openFile - 1] ?? null);

  /* A supporting file, fetched when its tab is opened and not before — the
     screen doing what SKILL.md itself does: name the neighbours, open one only
     when something sends you to it.

     **The fixture is derived below rather than fetched here**, which is not
     tidiness: writing it into state from an effect body is a setState React
     can see is synchronous, and the lint rule that catches it is right — the
     fixture is already in memory, so the render that needs it can simply read
     it. Only the real network path has anything to synchronise with. */
  useEffect(() => {
    if (skill === null || openFileName === null || fixture !== null || source === null) return;

    const controller = new AbortController();
    void (async () => {
      try {
        setFileText(await loadSkillFile(source, skill.name, openFileName, controller.signal));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        /* With the lid shut a file inside a folder (`scripts/`) is on the
           laptop only; say so rather than a placeholder for ever — and say
           any other failure too (29-1P14d2). */
        setFileText({ file: openFileName, text: err instanceof Error ? err.message : String(err) });
      }
    })();
    return () => controller.abort();
  }, [source, fixture, openFileName, skill]);

  /* Keyed on the file it was fetched for, so the previous one is never shown
     for a frame while the next is in flight — `fetched` above does the same
     for the skill itself. */
  const shownFile: { file: string; text: string } | null =
    skill === null || openFileName === null
      ? null
      : fixture !== null
        ? { file: openFileName, text: fixture.files[`${skill.name}/${openFileName}`] ?? '' }
        : fileText !== null && fileText.file === openFileName
          ? fileText
          : null;

  const skills = useMemo(() => index?.skills ?? [], [index]);
  const enabledCount = skills.filter((one) => one.enabled).length;
  /*
   * NEVER-LOADED IS ONLY A DIAGNOSIS FOR AN AUTOMATIC SKILL, SINCE `/` EXISTS.
   *
   * The sentence this feeds — *"a description that never matches is a folder
   * Atlas cannot see"* — is about a skill that was supposed to be picked up on
   * its own and never was. That is a real fault and worth the tile.
   *
   * An on-demand skill has never been loaded because nobody has typed `/` and
   * asked for it, which is not a fault and is the ordinary state of most of
   * the folders here. Counting those would have the tile report thirty-five
   * broken skills on a screen where nothing is wrong — the exact false alarm
   * the tile exists to avoid.
   *
   * `brokenCount` is unfiltered on purpose: a missing description stops `/`
   * listing it with a useful line too, so it is worth saying either way.
   */
  const neverUsed = skills.filter((one) => one.enabled && one.uses === 0).length;
  const brokenCount = skills.filter((one) => !one.valid).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    /* Name and description — there is nothing else to search, because the
       instructions are not loaded. That is not a shortcut: it is exactly what
       Atlas matches against before it opens anything. */
    return skills.filter(
      (one) =>
        (filter === 'all' || (filter === 'on' ? one.enabled : !one.enabled)) &&
        (needle === '' || `${one.name} ${one.description}`.toLowerCase().includes(needle)),
    );
  }, [skills, query, filter]);

  const readOnly = fixture !== null;

  const beginEdit = useCallback(() => {
    if (skill === null || readOnly) return;
    setDraftBody(skill.body);
    setDraftDescription(skill.description);
    setEditing(true);
    setOpenFile(0);
  }, [skill, readOnly]);

  async function commitSave() {
    if (skill === null || source === null || readOnly) return;
    if (draftDescription.trim() === '') {
      /* Refused here as well as on the laptop, and the message says why rather
         than just "required": a skill with no description appears in the list,
         appears to be on, and can never be loaded. That is a worse thing to
         hand somebody than a red line. */
      setToast({
        icon: 'circle-alert',
        title: 'A skill needs a description',
        detail: 'It is the line that decides when Atlas loads this. Without one the folder is invisible to it.',
      });
      return;
    }
    setSaving(true);
    try {
      const saved = await storeSkill(source, {
        name: skill.name,
        description: draftDescription,
        body: draftBody,
      });
      setFetched(saved);
      setEditing(false);
      setToast({
        icon: 'check',
        title: 'Saved',
        detail:
          source.kind === 'cloud'
            ? `${saved.name} — in the cloud copy. Atlas writes it to the laptop when it wakes.`
            : `${saved.name}/SKILL.md — plain text, on the laptop.`,
      });
      await load();
    } catch (err) {
      setToast({
        icon: 'circle-alert',
        title: 'Could not save',
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(name: string, enabled: boolean) {
    if (source === null || readOnly) return;
    try {
      await switchSkill(source, name, enabled);
      setToast(
        enabled
          ? {
              icon: 'wrench',
              title: `${name} is automatic`,
              detail: 'Atlas loads it when its description matches. Its description is now in every prompt.',
            }
          : {
              icon: 'power',
              title: `${name} is on demand`,
              detail: `The folder stays and costs nothing. Type /${name} in the chat to turn it on.`,
            },
      );
      await load();
    } catch (err) {
      setToast({
        icon: 'circle-alert',
        title: 'Could not change it',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function commitDelete() {
    if (skill === null || source === null || readOnly) return;
    const gone = skill;
    try {
      await removeSkill(source, gone.name);
      selectSkill(null);
      setFetched(null);
      setToast({
        icon: 'trash-2',
        title: `Deleted ${gone.name}`,
        detail: `The folder and ${gone.files.length + 1} ${gone.files.length === 0 ? 'file' : 'files'} went with it. Skills have no Trash.`,
      });
      await load();
    } catch (err) {
      setToast({
        icon: 'circle-alert',
        title: 'Could not delete',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function addSkill() {
    if (source === null || readOnly) return;
    /* A stub with a real description, not an empty one. `skills.html` creates
       a folder whose description says "write the description first"; writing
       an empty one would create exactly the invisible folder this screen
       spends its header warning about, and Atlas's own route refuses it. */
    try {
      const created = await storeSkill(source, {
        name: `new-skill-${skills.length + 1}`,
        description: 'Rewrite this line first — it is what decides when Atlas loads this skill.',
        body: '# What to do\n\n1. \n',
      });
      await load();
      selectSkill(created.name);
      setToast({
        icon: 'folder-plus',
        title: `Wrote ${created.name}`,
        detail: 'Change the description before anything else — that is what makes it findable.',
      });
    } catch (err) {
      setToast({
        icon: 'circle-alert',
        title: 'Could not create it',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const showList = docked || listOpen;
  const unavailable = index === null;

  const indexPanel = (
    <div
      style={
        docked
          ? { display: 'grid', gridTemplateRows: 'auto auto auto minmax(0,1fr)', gap: 'var(--sp-5)', minHeight: 0 }
          : {
              position: 'fixed', top: 'calc(var(--sp-7) + var(--safe-t))', left: 'calc(var(--sp-7) + var(--safe-l))', bottom: 'calc(var(--sp-7) + var(--safe-b))',
              width: 328, zIndex: Z.nav, boxSizing: 'border-box',
              display: 'grid', gridTemplateRows: 'auto auto auto minmax(0,1fr)', gap: 'var(--sp-5)', minHeight: 0,
              padding: 'var(--sp-7)', borderRadius: 'var(--r-sheet)',
              backgroundColor: 'oklch(0.145 0.004 260 / 0.96)', backgroundImage: 'var(--glass-fill-1)',
              border: '1px solid oklch(1 0 0 / 0.10)',
              backdropFilter: 'var(--glass-bd-xl)', WebkitBackdropFilter: 'var(--glass-bd-xl)',
              boxShadow: 'var(--glass-cast-3), var(--glass-inner-1)',
            }
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
        <MetaKicker>
          {enabledCount} of {skills.length} automatic
        </MetaKicker>
        <span style={{ flex: 1 }} />
        <IconButton label="Write a skill" title="Write a skill" variant="ghost" onClick={() => void addSkill()} disabled={readOnly || unavailable}>
          <Icon name="folder-plus" size={18} />
        </IconButton>
        {!docked && (
          <IconButton label="Close the list" title="Close the list" variant="ghost" onClick={() => setListOpen(false)}>
            <Icon name="x" size={18} />
          </IconButton>
        )}
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search skills"
        aria-label="Search skills"
        iconLeft={<Icon name="search" size={16} />}
      />

      {/* The soft pressed-in switch since 29-1P2, as every view switch. */}
      <SegmentedControl
        size="sm"
        look="soft"
        options={FILTERS}
        value={filter}
        onChange={(next) => setFilter(next as FilterId)}
        style={{ width: '100%' }}
      />

      <div
        className="ag-scroll ag-fade"
        style={{ overflowY: 'auto', overscrollBehavior: 'contain', display: 'grid', gap: 'var(--sp-2)', alignContent: 'start' }}
      >
        {/* 29-1P5c, idea 60: a new filter blurs across. */}
        <BlurAcross value={filter} index={FILTERS.findIndex((one) => one.value === filter)} style={{ display: 'grid', gap: 'var(--sp-2)', alignContent: 'start' }}>
        {visible.map((one) => (
          <SkillRow
            key={one.name}
            skill={one}
            selected={one.name === currentName}
            onPick={() => {
              selectSkill(one.name);
              if (!docked) setListOpen(false);
            }}
          />
        ))}
        {visible.length === 0 && (
          <LitLine
            text={skills.length === 0
              ? 'No skills yet.'
              : query.trim() === '' ? 'No skill matches that.' : `No skill matches **“${litSafe(query.trim())}”**.`}
            style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', padding: 'var(--sp-5)' }}
          />
        )}
        </BlurAcross>
      </div>
    </div>
  );

  return (
    <div className="ag-page ag-page--calm h-screen overflow-y-auto">
      <div style={{ display: 'flex', minHeight: '100%', alignItems: 'stretch' }}>
        {wide && (
          <div
            style={{
              position: 'sticky', top: 0, alignSelf: 'flex-start', flex: '0 0 auto',
              padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)',
            }}
          >
            <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} screenLit lead={<RailMark />} />
          </div>
        )}

        <div
          style={{
            flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
            padding: wide ? 'var(--sp-9) var(--gutter-page) var(--sp-9)' : 'var(--sp-8) var(--gutter-page-sm) 116px',
          }}
        >
          <header
            style={{
              width: '100%', maxWidth: COLUMN_PX, margin: '0 auto', flex: '0 0 auto',
              display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-7)', flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 260 }}>
              <MetaKicker>How Atlas knows how to do things</MetaKicker>
              <h1
                /* 29-1P5c, idea 57: shrinks and fades as the page scrolls. */
                className="ag-tuck-title"
                style={{
                  font: 'var(--type-display)', fontSize: 'var(--text-2xl)',
                  letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)', margin: 0,
                }}
              >
                Skills
              </h1>
              <p
                style={{
                  font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)',
                  margin: 0, maxWidth: '62ch', textWrap: 'pretty',
                }}
              >
                A skill is a folder of instructions, in plain text, so you can read and change any
                of them. An <strong>automatic</strong> one is offered to Atlas on every message and
                opened when its description matches the question — so keep those few. Everything
                else is <strong>on demand</strong>: it costs nothing and waits until you type{' '}
                <strong>/</strong> in the chat and name it.
              </p>
            </div>

            {/* The header tile, and the sentence on it is the point of the
                screen: a description that never matches is a folder Atlas
                cannot see. `skills.html`'s own copy. */}
            <div
              style={{
                display: 'grid', gap: 'var(--sp-4)', padding: 'var(--sp-6) var(--sp-7)',
                borderRadius: 'var(--r-card)', minWidth: 232,
                backgroundImage: 'var(--glass-fill-2)',
                boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
              }}
            >
              {/* 29-1P14d2: while the skills are on their way, the count and its
                  sentence wait too, rather than saying "0" and "No skills yet". */}
              {unavailable && waiting ? (
                <>
                  <Bone width={72} height={30} radius="var(--r-md)" />
                  <Bone width="86%" height={9} />
                </>
              ) : (
              <>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)' }}>
                <span
                  style={{
                    font: 'var(--type-metric)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xl)',
                    letterSpacing: 'var(--tracking-display)', color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {enabledCount}
                </span>
                <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
                  / {skills.length} automatic
                </span>
              </span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
                {brokenCount > 0
                  ? `${brokenCount} ${brokenCount === 1 ? 'folder has' : 'folders have'} no description, so Atlas cannot see ${brokenCount === 1 ? 'it' : 'them'} at all.`
                  : skills.length === 0
                    ? <LitLine text="No skills yet. Atlas has **every tool** already; a skill is **a written how-to** for one job." />
                    : neverUsed > 0
                      ? `${neverUsed} automatic ${neverUsed === 1 ? 'skill has' : 'skills have'} never been loaded. A description that never matches is a folder Atlas cannot see.`
                      : enabledCount === 0
                        ? 'Nothing fires on its own. Every skill here waits for you to type / in the chat.'
                        : 'Every automatic skill here has been used at least once.'}
              </span>
              </>
              )}
            </div>
          </header>

          <div
            ref={arrived}
            style={{
              width: '100%', maxWidth: COLUMN_PX, margin: 'var(--sp-9) auto 0', flex: 1, minHeight: 0,
              display: 'grid',
              gridTemplateColumns: docked && !unavailable ? '300px minmax(0,1fr)' : 'minmax(0,1fr)',
              gap: 'var(--sp-7)',
            }}
          >
            {showList && !unavailable && indexPanel}

            {unavailable && waiting ? (
              <MemoryWaiting docked={docked} label="Reading the skills" />
            ) : unavailable ? (
              <Unavailable
                loading={loading}
                status={status}
                fromCloud={source?.kind === 'cloud'}
                problem={problem}
                onRetry={() => void load()}
              />
            ) : skill === null ? (
              <EmptyDetail
                hasSkills={skills.length > 0}
                loading={loading}
                readOnly={readOnly}
                onAdd={() => void addSkill()}
              />
            ) : (
              <SkillDetail
                skill={skill}
                root={index?.root ?? ''}
                skillFile={index?.skillFile ?? 'SKILL.md'}
                docked={docked}
                readOnly={readOnly}
                editing={editing}
                saving={saving}
                draftBody={draftBody}
                draftDescription={draftDescription}
                openFile={openFile}
                fileText={shownFile}
                onOpenList={() => setListOpen(true)}
                onOpenFile={setOpenFile}
                onToggle={(on) => void toggle(skill.name, on)}
                onBeginEdit={beginEdit}
                onCancelEdit={() => setEditing(false)}
                onDraftBody={setDraftBody}
                onDraftDescription={setDraftDescription}
                onSave={() => void commitSave()}
                onDelete={() => void commitDelete()}
              />
            )}
          </div>
        </div>

        {showList && !docked && !unavailable && (
          <button
            type="button"
            aria-label="Close the list"
            onClick={() => setListOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: Z.nav - 1, border: 0, cursor: 'default',
              background: 'oklch(0.05 0 0 / 0.5)',
              backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
            }}
          />
        )}

        {toast && (
          <div
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-13) + var(--safe-b))',
              display: 'grid', placeItems: 'center', zIndex: Z.toast, pointerEvents: 'none',
            }}
          >
            <span style={{ pointerEvents: 'auto' }}>
              <Toast
                icon={<Icon name={toast.icon} size={16} />}
                title={toast.title}
                detail={toast.detail}
                onDismiss={() => setToast(null)}
              />
            </span>
          </div>
        )}

        {!wide && (
          <div
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-5) + var(--safe-b))',
              display: 'grid', placeItems: 'center', zIndex: Z.nav, pointerEvents: 'none',
            }}
          >
            <span style={{ pointerEvents: 'auto' }}>
              <MiniNav items={nav.items} value={nav.current} onChange={nav.go} screenLit />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** One row in the index. A folder name, and the two numbers that say whether it earns its place. */
function SkillRow({
  skill,
  selected,
  onPick,
}: {
  skill: AtlasSkillHeader;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', width: '100%', minHeight: 54,
        padding: '0 var(--sp-5)', border: 0, cursor: 'pointer', textAlign: 'left',
        borderRadius: 'var(--r-pill)',
        backgroundImage: selected ? 'var(--glass-fill-2)' : 'none',
        boxShadow: selected ? 'var(--glass-rim-2), var(--glass-cast-1)' : 'none',
        /* On demand is dimmed rather than hidden or struck through: the folder
           is still there and is one `/` away, which is exactly what the
           mockup's 0.58 says. It reads as quiet, not as gone — and since `/`
           arrived that is the more accurate of the two readings. */
        opacity: skill.enabled ? 1 : 0.58,
        transition: 'var(--t-hover)',
      }}
    >
      <span
        style={{
          display: 'flex', flex: '0 0 auto',
          color: !skill.enabled ? 'var(--fg-4)' : selected ? 'var(--job-lime)' : 'var(--fg-3)',
        }}
      >
        <Icon name={skill.valid ? 'wrench' : 'triangle-alert'} size={15} />
      </span>
      <span style={{ display: 'grid', gap: 1, flex: 1, minWidth: 0 }}>
        <span
          style={{
            font: 'var(--type-numeric)', fontSize: 'var(--text-sm)',
            color: selected ? 'var(--fg-1)' : 'var(--fg-2)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {skill.name}/
        </span>
        <span
          style={{
            font: 'var(--type-caption)', color: 'var(--fg-4)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {skill.files.length + 1} {skill.files.length === 0 ? 'file' : 'files'} · used {skill.uses}×
        </span>
      </span>
      {!skill.enabled && <MetaKicker>/</MetaKicker>}
    </button>
  );
}

/** One skill: what it is for, whether it is on, and the file itself. */
function SkillDetail({
  skill,
  root,
  skillFile,
  docked,
  readOnly,
  editing,
  saving,
  draftBody,
  draftDescription,
  openFile,
  fileText,
  onOpenList,
  onOpenFile,
  onToggle,
  onBeginEdit,
  onCancelEdit,
  onDraftBody,
  onDraftDescription,
  onSave,
  onDelete,
}: {
  skill: AtlasSkill;
  root: string;
  skillFile: string;
  docked: boolean;
  readOnly: boolean;
  editing: boolean;
  saving: boolean;
  draftBody: string;
  draftDescription: string;
  openFile: number;
  fileText: { file: string; text: string } | null;
  onOpenList: () => void;
  onOpenFile: (index: number) => void;
  onToggle: (enabled: boolean) => void;
  onBeginEdit: () => void;
  onCancelEdit: () => void;
  onDraftBody: (body: string) => void;
  onDraftDescription: (description: string) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const files = [skillFile, ...skill.files];

  return (
    <section
      className="ag-scroll"
      style={{
        minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
        padding: 'var(--pad-card)', borderRadius: 'var(--r-card-lg)',
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
      }}
    >
      <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
          {!docked && (
            <IconButton label="All skills" title="All skills" variant="ghost" onClick={onOpenList}>
              <Icon name="panel-left" size={18} />
            </IconButton>
          )}

          <span
            style={{
              display: 'grid', placeItems: 'center', width: 42, height: 42, flex: '0 0 auto',
              borderRadius: '50%',
              backgroundImage: skill.enabled ? 'var(--glass-tint-violet)' : 'var(--glass-fill-1)',
              boxShadow: skill.enabled ? 'var(--glass-rim-2)' : 'var(--glass-rim-1)',
              color: skill.enabled ? 'var(--job-violet-text)' : 'var(--fg-4)',
            }}
          >
            <Icon name="wrench" size={20} />
          </span>

          <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 200 }}>
            <h2
              style={{
                font: 'var(--type-numeric)', fontSize: 'var(--text-xl)', color: 'var(--fg-1)',
                margin: 0, overflowWrap: 'anywhere',
              }}
            >
              skills/{skill.name}/
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
              <StatusPill status={skill.enabled ? 'running' : 'archived'} size="sm" dot={skill.enabled}>
                {skill.enabled ? 'automatic' : 'on demand'}
              </StatusPill>
              <MetaKicker>
                {files.length} {files.length === 1 ? 'file' : 'files'} · {skill.bytes.toLocaleString()} bytes
              </MetaKicker>
              <MetaKicker>{describeAuthor(skill)}</MetaKicker>
              <MetaKicker>{describeUses(skill)}</MetaKicker>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flex: '0 0 auto' }}>
            <Switch
              checked={skill.enabled}
              onChange={onToggle}
              disabled={readOnly}
              label={skill.enabled ? 'Automatic' : 'On demand'}
            />
            <MorphMenu
              align="end"
              width={276}
              header={{ title: skill.name, meta: `${files.length} files · used ${skill.uses}×` }}
              trigger={
                <IconButton label="Skill actions" title="Skill actions" variant="ghost">
                  <Icon name="ellipsis" size={18} />
                </IconButton>
              }
              items={[
                { section: 'This folder' },
                {
                  value: 'edit',
                  label: 'Edit the instructions',
                  icon: <Icon name="pencil" size={16} />,
                  meta: 'plain text',
                  /* `MorphMenuItem` has no `disabled`, and this does not add
                     one for a state only the screenshot fixture reaches:
                     `onBeginEdit` refuses under it, and the Edit button beside
                     the file tabs carries the real disabled affordance. */
                  onSelect: onBeginEdit,
                },
                { divider: true },
                { section: 'Careful', tone: 'danger' },
                {
                  value: 'delete',
                  label: 'Delete this skill',
                  icon: <Icon name="trash-2" size={16} />,
                  tone: 'danger',
                  confirm: {
                    label: `Delete ${skill.name}?`,
                    hint: `The folder and all ${files.length} ${files.length === 1 ? 'file' : 'files'} go. Atlas will not know how to do this, and there is no Trash for skills.`,
                    action: 'Delete',
                    onConfirm: onDelete,
                  },
                },
              ]}
            />
          </div>
        </div>

        {/* The description IS the retrieval key. Say so, every time. */}
        <div
          style={{
            display: 'grid', gap: 'var(--sp-4)', padding: 'var(--sp-6)',
            borderRadius: 'var(--r-lg)',
            backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
          }}
        >
          {editing ? (
            <Textarea
              rows={2}
              value={draftDescription}
              onChange={(e) => onDraftDescription(e.target.value)}
              placeholder="When does this apply?"
              aria-label="When this skill applies"
            />
          ) : (
            <p style={{ font: 'var(--type-body)', color: 'var(--fg-1)', margin: 0, maxWidth: '64ch', textWrap: 'pretty' }}>
              {skill.description === '' ? 'No description.' : skill.description}
            </p>
          )}
          <span style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
            <span
              style={{
                display: 'flex', flex: '0 0 auto', marginTop: 1,
                color: skill.valid ? 'var(--job-violet)' : 'var(--status-warn)',
              }}
            >
              <Icon name={skill.valid ? 'key-round' : 'triangle-alert'} size={14} />
            </span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
              {skill.problem ??
                'This is the only part Atlas sees without opening the folder, so it is what decides whether the skill is ever used.'}
            </span>
          </span>
        </div>

        {/* What a skill can and cannot do. The mockup draws a per-skill
            permission row here; Atlas has no such thing and inventing one
            would state a boundary that does not exist. The sentence under it
            is true and is what survives. */}
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', maxWidth: '64ch', textWrap: 'pretty' }}>
          A skill tells Atlas how to do something. It cannot widen what Atlas is allowed to do — every
          change it makes is the same undoable set as any other turn, and the two things that need your
          tap still need it.
        </span>

        {/* The folder, and the file. Shown, not described. */}
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <MetaKicker>The folder</MetaKicker>
            <span style={{ flex: 1, height: 1, background: 'var(--line-faint)' }} />
            {editing ? (
              <span style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                <Button size="sm" variant="ghost" onClick={onCancelEdit} disabled={saving}>
                  Cancel
                </Button>
                {/* A form's Save: solid white since 29-1P2. */}
                <WhiteButton size="sm" onClick={onSave} disabled={saving} aria-busy={saving || undefined}>
                  {saving ? 'Saving…' : 'Save'}
                </WhiteButton>
              </span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                iconLeft={<Icon name="pencil" size={14} />}
                onClick={onBeginEdit}
                disabled={readOnly}
              >
                Edit
              </Button>
            )}
          </div>

          {!editing && (
            <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
              {files.map((file, i) => {
                const on = i === openFile;
                /* Pick one, so the open file presses in (29-1P2), as
                   every pick-one control does since the sheets. */
                return (
                  <SoftToggle
                    key={file}
                    size="sm"
                    pressed={on}
                    onClick={() => onOpenFile(i)}
                    icon={<Icon name="file-text" size={12} />}
                    style={{ flex: '0 0 auto', font: 'var(--type-numeric)', fontSize: 'var(--text-xs)' }}
                  >
                    {file}
                  </SoftToggle>
                );
              })}
            </div>
          )}

          {/* 29-1P14d2: a file on its way is lines of placeholder, not "Reading the laptop…". */}
          {!editing && openFile > 0 && fileText === null ? (
            <Skeleton
              label="Reading the file"
              lines={6}
              height={10}
              lastLineWidth="40%"
              style={{ padding: 'var(--sp-5) var(--sp-6)', borderRadius: 'var(--r-sm)', backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)' }}
            />
          ) : editing ? (
            <Textarea
              rows={18}
              value={draftBody}
              onChange={(e) => onDraftBody(e.target.value)}
              aria-label={`The instructions in ${skillFile}`}
              style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', lineHeight: 'var(--leading-relaxed)' }}
            />
          ) : (
            <pre
              className="ag-scroll"
              style={{
                margin: 0, padding: 'var(--sp-5) var(--sp-6)', borderRadius: 'var(--r-sm)',
                backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
                font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
                lineHeight: 'var(--leading-relaxed)', color: 'var(--fg-2)',
                whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
              }}
            >
              {openFile === 0 ? skill.body.trim() : fileText?.text.trim()}
            </pre>
          )}

          {openFile > 0 && !editing && (
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
              Atlas loads this file only when {skillFile} points at it.
            </span>
          )}
        </div>

        {root !== '' && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', overflowWrap: 'anywhere' }}>
            {root}
          </span>
        )}
      </div>
    </section>
  );
}

/** No skill selected — either there are none, or the one that was is gone. */
function EmptyDetail({
  hasSkills,
  loading,
  readOnly,
  onAdd,
}: {
  hasSkills: boolean;
  loading: boolean;
  readOnly: boolean;
  onAdd: () => void;
}) {
  return (
    <section
      style={{
        display: 'grid', placeItems: 'center', alignContent: 'center', gap: 'var(--sp-5)',
        borderRadius: 'var(--r-card-lg)', padding: 'var(--pad-card-lg)',
        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
      }}
    >
      <span
        style={{
          display: 'grid', placeItems: 'center', width: 48, height: 48, borderRadius: '50%',
          backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-4)',
        }}
      >
        <Icon name="wrench" size={22} />
      </span>
      <span
        style={{
          font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)',
          maxWidth: '42ch', textAlign: 'center', textWrap: 'pretty',
        }}
      >
        {hasSkills
            ? 'Pick a skill from the list.'
            : <LitLine text="No skills yet. Atlas has **every tool** already; a skill is **a written how-to** for one job." />}
      </span>
      {!loading && !hasSkills && !readOnly && (
        /* The empty pane's one action: a plain gel since 29-1P2, as an empty
           New Session pane's Smart start is — violet, because a skill is
           Atlas's. */
        <GelButton tile={false} size="md" colour="violet" icon={<Icon name="folder-plus" size={16} />} onClick={onAdd}>
          Write the first skill
        </GelButton>
      )}
    </section>
  );
}

/**
 * The laptop did not answer.
 *
 * `/catalog`'s four states, with the copy pointed at skills: the same three
 * fixes, told apart the same way, because it is the same laptop and the same
 * folder. The wording differs only where the thing being described does.
 */
function Unavailable({
  loading,
  status,
  fromCloud,
  problem,
  onRetry,
}: {
  loading: boolean;
  status: string;
  /** Reading the cloud copy because the laptop is asleep (BIG-4). */
  fromCloud: boolean;
  problem: { message: string; tooOld: boolean } | null;
  onRetry: () => void;
}) {
  const body =
    fromCloud
      ? {
          icon: (problem !== null ? 'circle-alert' : 'book-open') as IconName,
          title: problem !== null ? 'The laptop is asleep, and the cloud copy did not answer.' : 'Nothing to show yet.',
          detail: problem?.message ?? '',
        }
      : status === 'unconfigured'
      ? {
          icon: 'server' as IconName,
          title: 'No Atlas is configured.',
          detail:
            'Skills are folders on your laptop, so this app needs to know where Atlas is before it can show you any. That address is VITE_ATLAS_URL.',
        }
      : status === 'asleep'
        ? {
            icon: 'moon' as IconName,
            title: 'The laptop is asleep.',
            detail:
              'Your skills are folders on it, not in this browser — so there is only ever one copy, and it is the one you can open in a text editor. Open the laptop and they are here.',
          }
        : problem?.tooOld === true
          ? {
              icon: 'circle-alert' as IconName,
              title: 'This Atlas is older than skills.',
              detail: 'The laptop is awake but running a build from before it could read a skills folder. Restart Atlas on it.',
            }
          : problem !== null
            ? {
                icon: 'circle-alert' as IconName,
                title: 'Atlas could not open its skills folder.',
                detail: problem.message,
              }
            : {
                icon: 'wrench' as IconName,
                title: 'Nothing to show yet.',
                detail: 'Atlas answered, but sent no skills.',
              };

  return (
    <section
      style={{
        display: 'grid', justifyItems: 'center', gap: 'var(--sp-5)', textAlign: 'center',
        padding: 'var(--sp-13) var(--pad-card)', borderRadius: 'var(--r-card-lg)',
        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
      }}
    >
      <span
        style={{
          display: 'grid', placeItems: 'center', width: 48, height: 48, borderRadius: '50%',
          backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-4)',
        }}
      >
        <Icon name={body.icon} size={22} />
      </span>
      <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-md)', color: 'var(--fg-2)' }}>{body.title}</span>
      {body.detail !== '' && (
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', maxWidth: '54ch', textWrap: 'pretty' }}>
          {body.detail}
        </span>
      )}
      {!loading && (
        <SoftButton size="sm" icon={<Icon name="refresh-cw" size={14} />} onClick={onRetry}>
          Try again
        </SoftButton>
      )}
    </section>
  );
}
