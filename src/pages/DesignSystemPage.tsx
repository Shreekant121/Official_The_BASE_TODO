/**
 * `/design` — BASE's design system, live (29-1P1, BIG-15). His "dedicated
 * space": every colour with its job, every button, the motion curves, and the
 * pieces each later 29-1P session adds, in one place he can press. His call
 * (2026-09-30): a hidden address, typed, with nothing in the app linking here.
 *
 * Nothing on this page touches his data. The buttons do what they would do
 * only to themselves: Hold to empty Trash empties nothing.
 *
 * A LATER SESSION ADDS ITS PIECE HERE as it lands, under the heading it
 * belongs to, so the page stays the one place the whole system can be seen.
 */
import { useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeFold, BlurAcross, COLOUR_JOBS, COLOUR_JOB_INFO, Card, Checkbox, CountChip, DatePage, Dialog, DotArrowLink, FloatingAddButton, GelButton,
  GradientNumber, HoldToConfirm, Icon, IconButton, Input, Knob, LayeredIcon, MetaKicker, MiniNav, MorphIcon, MorphMenu, SegmentedControl,
  NotificationCard, PulseSquares, ScoreDial, Slider, SlideToStart, SoftButton, SoftIconButton, SoftToggle, SplitButton, StatusPill, StepTrack, Strike, Switch, TickBox, popTick, withStepWash, STEP_WASH_TRANSITION, Toast, useGlide, useTilt, WarnLine, WhiteButton,
  type ColourJob, type IconName,
} from '../ui';
import { Tick } from '../components/project/parts';
import { CardsSpecimen } from '../components/project/CardsSpecimen';
import { CoversSpecimen, FocusLightSpecimen, FoldersSpecimen, ProjectIconsSpecimen } from '../components/CoversSpecimen';
import { DarkTintPicker } from '../components/AppearanceSection';
import HumanOverridePicker from '../components/task-fields/HumanOverridePicker';
import { DashboardSpecimens } from '../components/dashboard/specimens';
import SoundSection from '../components/SoundSection';
import { cue, type Cue } from '../lib/sound';
import { buzz, type BuzzName } from '../lib/haptics';
import { gatherBack, turnToDust } from '../lib/dust';
import { SwipeRow } from '../ui/core/SwipeRow';
import { doneSide, tomorrowSide } from '../components/task-fields/swipeSides';
import { peekAttr } from '../lib/peek';
import { readDue } from '../lib/dueDate';
import { resolveUserTimeZone, toTaskDateString } from '../lib/agent/dates';
import { EmergencyMark } from '../components/task-fields/TaskMarks';
import { HEALTH_PILL } from '../components/project/useProjectPulse';
import { FoldRegroupSpecimen } from '../components/project/FoldRegroupSpecimen';
import { ProjectHeaderSpecimen } from '../components/project/ProjectHeaderSpecimen';
import { TaskStorySpecimen } from '../components/task-fields/TaskStorySpecimen';
import { FocusStartSpecimen } from '../components/FocusStartSpecimen';
import { FocusMomentsSpecimen } from '../components/FocusMomentsSpecimen';
import { FocusBreakSpecimen } from '../components/FocusBreakSpecimen';
import { FocusStandBySpecimen } from '../components/FocusStandBySpecimen';
import { WinsSpecimen } from '../components/WinsSpecimen';
import { MomentsSpecimen } from '../components/MomentsSpecimen';
import { MonthWrappedSpecimen } from '../components/MonthWrappedSpecimen';
import { WordsSpecimen } from '../components/WordsSpecimen';
import { NoticesSpecimen } from '../components/NoticesSpecimen';
import { PlaceholdersSpecimen } from '../components/PlaceholdersSpecimen';
import { AtlasAtWorkSpecimen } from '../components/AtlasAtWorkSpecimen';
import { AtlasAtRestSpecimen } from '../components/AtlasAtRestSpecimen';
import { AtlasLongJobSpecimen } from '../components/AtlasLongJobSpecimen';
import { lastDays } from '../lib/stats';
import type { HealthState } from '../lib/projectHealth';
import { useStore } from '../store/useStore';

const GRID: CSSProperties = {
  display: 'grid', gap: 'var(--sp-6)', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
};

export default function DesignSystemPage() {
  const navigate = useNavigate();
  return (
    <div className="ag-page h-screen overflow-y-auto">
      <div style={{ boxSizing: 'border-box', padding: 'var(--sp-9) var(--gutter-page-sm) 128px' }}>
        <div style={{ width: '100%', maxWidth: 1120, margin: '0 auto', display: 'grid', gap: 'var(--sp-10)' }}>
          <header style={{ display: 'grid', gap: 'var(--sp-5)' }}>
            <IconButton label="Back" onClick={() => navigate(-1)}>
              <Icon name="arrow-left" size={18} />
            </IconButton>
            <h1 className="ag-tuck-title" style={{ font: 'var(--weight-light) var(--text-5xl) / 1 var(--font-display)', letterSpacing: '-0.045em', color: 'var(--fg-1)' }}>
              Design system
            </h1>
            <p style={{ font: 'var(--type-body)', color: 'var(--fg-3)', maxWidth: 680, textWrap: 'pretty' }}>
              Everything here is live: press it. The rule that keeps BASE minimal while it gets colourful is{' '}
              <b style={{ color: 'var(--fg-1)', fontWeight: 'var(--weight-medium)' }}>One colour, one job.</b>{' '}
              A colour means the same thing on every screen, so you learn it once.
            </p>
          </header>

          <Section title="Colours" sub="Each as its Start button and its small tag. The job is what it means everywhere.">
            <div style={GRID}>
              {COLOUR_JOBS.map((c) => <ColourCard key={c} colour={c} />)}
            </div>
          </Section>

          <Section title="Running, or done" sub="The two greens (29-1P2c1). Emerald is only what is running right now. Lime is done, ticked, chosen and the current one.">
            <RunningOrDone />
          </Section>

          <Section title="Errors, warnings and dates" sub="29-1P2c2. Coral is what failed, broke, ran over or is about to be missed. A warning is quiet: grey, with its triangle. A date is sky.">
            <ErrorsWarningsDates />
          </Section>

          <Section title="Atlas, Focus and your judgement" sub="29-1P2c3. Violet is everything Atlas says, does or waits on, working or not. Teal is Focus's own stage and its sound. Your own judgement takes no colour at all.">
            <AtlasFocusJudgement />
          </Section>

          <Section title="Buttons" sub="Thirteen, each with one job. Pick by what the action is, not by what looks good beside it.">
            <Buttons />
          </Section>

          <Section title="Numbers in their colour" sub="Big figures carry a ramp that says what they are: cool for focus, warm for streaks, green for done.">
            <div style={GRID}>
              <NumberCard tone="focus" value="4.3h" label="focused today" />
              <NumberCard tone="streak" value="12" label="day streak" />
              <NumberCard tone="done" value="86%" label="done this week" />
            </div>
          </Section>

          <Section title="Switches" sub="Hold one: the knob stretches toward where it is going, then springs across and lights lime.">
            <SwitchCard />
          </Section>

          <Section title="Motion" sub="Three curves. Press Play to see each one move.">
            <div style={GRID}>
              <CurveCard name="Spring" curve="var(--ease-springy)" use="A switch's knob, a card landing. Overshoots a little." />
              <CurveCard name="Pop" curve="var(--ease-pop)" use="A badge or a tick arriving. Overshoots more." />
              <CurveCard name="Glide" curve="var(--ease-glide)" use="A ring or a pill sliding between places. Never overshoots." />
            </div>
          </Section>

          <Section title="Sound and touch" sub="29-1P3. Every sound is made by the browser, no files. Turn your speakers on and press. With headphones, each one comes from the side you pressed.">
            <SoundTouch />
          </Section>

          <Section title="Undo" sub="29-1P4a. Your last 20 ticks, deletes, moves, dates and importance changes, on this device. The bar shows how long the Undo stays; after that Ctrl+Z and two fingers still reach it.">
            <UndoSpecimen />
          </Section>

          <Section title="The tick" sub="29-1P4b. Tick these quickly: the check draws, the box pops, a line slides through, a gold +1 floats up, and from the second quick tick a chip counts the run, warming as it grows. On a board a ticked task sinks to the bottom of its list.">
            <TickSpecimen />
          </Section>

          <Section title="Dust and counts" sub="29-1P4c. Delete the row: it breaks into dust that drifts away, as every deleted task, list, project and Trash row does. Bring it back and the dust gathers into it, as an undo does. Press + and − : the count rolls, and the badge bounces when it grows.">
            <DustSpecimen />
          </Section>

          <Section title="Each screen's light" sub="29-1P5a. Every screen glows its own colour in its corner, by its job, and changing screen fades one light into the next. Press a screen to go there and watch. The Dashboard's light is the hour's sky: press Play the day.">
            <ScreenLights />
          </Section>

          <Section title="The nav" sub="29-1P5b. Every icon wears the colour of the screen it opens; the one you are on glows, with a light under it and a dot. Tap another icon: the dot stretches toward it like a drop and snaps there. Every icon is two layers, colour behind glass; point at one and they part. Pick a screen's light to see the nav wear it.">
            <NavSpecimen />
          </Section>

          <Section title="Moving" sub="29-1P5c. Point down the list: one soft highlight glides from row to row, as in every menu, the Ctrl+K results and the rail above. Switch the day: the old list blurs away the way you went and the new one comes into focus. Press the three buttons: each icon becomes the next shape. Point at the block: its edge lights where you point, in the Dashboard's colour (laptop only). And scroll this page: its big title shrinks and fades.">
            <MovingSpecimen />
          </Section>

          <Section title="Sheets and menus" sub="29-1P6a. Press the task: its sheet grows out of the row, the page behind sinks back, and closing it shrinks the sheet back into the row. Hold When and slide down to a choice, then let go: one motion instead of two taps (a tap still opens it). The menu's keys show as little raised keys on the laptop, as in Ctrl+K. On a board, Select's bar splits into Move, Done and Delete.">
            <SheetsSpecimen />
          </Section>

          <Section title="Hold and flick" sub="29-1P6b. On the tablet, swipe the task right to finish it or left to start it tomorrow: the colour behind says which, it clicks when letting go would do it, and the row springs home. Hold a task in a list that cannot be reordered (the Dashboard, Notifications, the Score strip, Ctrl+K) and its details rise until you let go. Flick a notice sideways and it flies off; a slow drag springs back.">
            <HoldFlickSpecimen />
          </Section>

          <Section title="Drag and scroll" sub="29-1P6c. Point at the card: it leans toward the mouse and a light follows it (project cards on Home and Dashboard blocks, laptop only). On a project's board, pull down from the very top: the pill fills with indigo, its arrow flips when you have pulled far enough, and letting go opens the project's own Backburner above the board; pull again to tuck it away (on the laptop: Show Backburner in the project's menu). Drag a task into another list, or a Dashboard block in edit mode: near its slot it is pulled in, the slot lights, and on letting go it glides into place.">
            <DragScrollSpecimen />
          </Section>

          <Section title="Badges and dates" sub="29-1P7a. A task shows one badge at a time: Red Alert first, then an Emergency, then its score, with the rest behind +N. Point at the +N (or tap it) and they slide out. A score warms as it rises, white to gold to orange; only Red Alert is coral. A due date is a tiny calendar page that warms from sky to coral as the day nears, coral on the day. Tap a page to push it a day and watch it flip (here only).">
            <BadgesDatesSpecimen />
          </Section>

          <Section title="Steps" sub="29-1P7b. A task with subtasks fills with a faint lime wash from the left as they get done, a brighter line at its front; the grey bar along its foot is gone. Six subtasks or fewer show as dots on a line, more as 2/5. Tap the dots to unfold the subtasks and tick them right there. Ticking the last one leaves the task itself alone.">
            <StepsSpecimen />
          </Section>

          <Section title="Cards" sub="29-1P7c. Pick how much each card shows: everything, one line with its badge, or the title alone; the cards fold smoothly between them (on a board, the switch beside Board and List, remembered per project). Point at a card: Start, Tomorrow and Done slide in beside its menu (laptop only; on the tablet, swipe). Point at the locked card: a dotted white line draws to the task it waits on, which lights up; point at that one and the line runs out to what it holds back. On the tablet, tap a card's Waiting on line instead. These cards are pretend: nothing here changes a real task.">
            <CardsSpecimen />
          </Section>

          <Section title="Covers" sub="29-1P8a. A project with no photo draws its own cover, in the style picked for it in its sheet: a pattern (mesh, waves, stripes or dots), its icon as layered glass, its name, a glimpse of its lists (ticked tasks in lime), the page's own aurora, or no cover at all (the card starts with its icon and name). Switch where the colours come from, any two of the ten, your dark tint, or greys, and Shuffle for another. Point at the icon one: its layers part.">
            <CoversSpecimen />
          </Section>

          <Section title="Project icons" sub="29-1P8a2. Every project wears a white icon on frosted glass, with its cover's main colour glowing behind it — a photo's own colour when it has one. Pick one in the project's sheet: tap the icon and search all 1,512. Point at one: its layers part.">
            <ProjectIconsSpecimen />
          </Section>

          <Section title="Focus in its cover's colours" sub="29-1P11c. Focus takes the colours of the project's own cover, its photo's or its made cover's: the page glows in the main one, and while the clock runs the card casts both onto the page round it. A task in no project keeps Focus's teal; past zero it is still gold. And the clock is just the numbers now, with no line under them.">
            <FocusLightSpecimen />
          </Section>

          <Section title="Pulse and health" sub="29-1P8b. Every project card on Home, and the Dashboard's project block, shows its last two weeks as squares, one a day, brighter lime the more got done; point at one for its day. While a project is in progress its pill says how it is going instead: On track, At risk (grey with a warning sign), Off track (coral, something is already late), or Quiet (nothing has a deadline and nothing was done this week), with one line saying why under the description. These are pretend projects.">
            <PulseSpecimen />
          </Section>

          <Section title="Folders and Jump back in" sub="29-1P8c. A project with projects inside looks like a folder on Home: its cover is made of theirs, four at most, with “+N” past four. Tap it and they unfold in a row under it, with Open at the end for its own lists. Above your projects, Jump back in keeps the last four you had open on this device and where you were; tap one to land there, the task glowing once. Ctrl+K shows the same four before you type. These are pretend projects.">
            <FoldersSpecimen />
          </Section>

          <Section title="Fold and regroup" sub="29-1P9a. On a board, the arrow before a list's name folds it into a thin spine: its name sideways, how many are done and a small lime bar, and the lists beside it widen. Tap the spine to open it again. Where the board is one column (the upright tablet) the spine lies flat as a one-line bar. Remembered per project on this device. In the list view, Group: List opens a menu: by list, by due date (Overdue, Today, Tomorrow, This week, Later, No date) or by Score (Red Alert, Emergency, Hot, Warm, everything else); the rows glide to their new groups. These are pretend lists.">
            <FoldRegroupSpecimen />
          </Section>

          <Section title="Milestones and when it'll be done" sub="29-1P9b. On a project's page, “40% done” is a button with the day it lands at your pace beside it: coral and “late” when that is after the project's Finish by, lime when it is before. Press it: the milestones fold down on a line (done ones lime, the next one glowing, the rest with their dates in sky), and under them a chart of tasks done, carried on dotted at the last two weeks' pace. Tap a milestone to see what it waits on: what its sheet says it Depends on. Run a finger or the mouse along the chart to read any day. Change Finish by and watch the words move. Switch any task to a milestone under Optional in its sheet. A board opened side by side shows “40%” instead of the ring. This is a pretend project.">
            <ProjectHeaderSpecimen />
          </Section>

          <Section title="The task's story" sub="29-1P9c. At the foot of every task's sheet, under Optional, a closed Story row says how many moments there are and the latest one. Open it: a line draws down past what has happened, newest first, each dot in its job's colour: lime done and steps, teal focus, sky dates and pushes, coral Emergency and Red alert, violet anything Atlas did, white importance, grey the rest. The last five show, then Show all. It keeps the last 30, and Made always. And the steps say how far they are as a white glowing percentage, in place of the ring: tick these. This is a pretend task.">
            <TaskStorySpecimen />
          </Section>

          <Section title="Starting a task" sub="29-1P10a. Press Start a session: the screen goes quiet and one teal circle grows as you breathe in and shrinks as you breathe out, then the clock starts (Focus does this once, at the start of a session; Skip is always there). Before a task's clock first runs, Focus asks one line, When this ends, I'll have…, and keeps it under the title; Mark done then asks whether you did it. Not yet keeps the task open. Slide the ruler: it clicks every five minutes and says when you would finish. On Focus it is + time; on Set Deadlines, press a task's time.">
            <FocusStartSpecimen />
          </Section>

          <Section title="While you work" sub="29-1P10b. When a clock on Focus passes zero while you are deep in it, it does not turn red: the numbers go gold and count up, “in flow”, on the task's clock and the session's alike, and the timer pill goes gold too. The session's end rings the bowl once, softly. Wrap up beside the clock opens Mark done. Halfway through a task of 20 minutes or more, a note asks if you are still on it for ten seconds, silently, then goes; Switch pauses the clock and opens today's queue. On the tablet, leaving BASE for another app for 2 minutes or more (or locking it for longer than the task had left) brings the away card back with you: Don't count them takes the minutes off your hours and puts them back on the clock. These are pretend.">
            <FocusMomentsSpecimen />
          </Section>

          <Section title="StandBy" sub="29-1P10c. On the tablet held sideways with Focus running, a minute after you last touch it, Focus becomes a clock: the task's time and its name on black, nothing else. Past zero it goes gold and counts up, as on Focus. From 9 at night to 5 in the morning (the Dashboard's night) it is dim red on pure black, so it can sit by the bed. A tap brings Focus back; leave it alone and the clock returns. The timer and brown noise carry on under it. These are pretend.">
            <FocusStandBySpecimen />
          </Section>

          <Section title="Breaks and the finish" sub="29-1P11a. In pomodoro mode (Settings, Brown noise, Focus / break cycle), when a focus block ends a card asks whether to take a break, on any screen. Take a break: the task's clock and the sound pause, and a calm teal card counts the break down with one small thing to do from your own list (Settings, Brown noise, Edit ideas: about 250 to start, add your own, take any out). Another idea shows a different one; +2 min adds time; at zero it waits for Back to work, which starts a fresh block. Every fourth break is the long one. Break time does not count towards your hours. When the queue is finished, Session done shows the time, subtasks ticked, ideas captured and pauses, then Another 25 (your next best task with 25 minutes), Break (pomodoro mode only) and Done. These are pretend.">
            <FocusBreakSpecimen />
          </Section>

          <Section title="Wins" sub="29-1P14a. When today beats your best (most focus in a day, most tasks done in a day, the longest run of days in a row), the number turns gold and a New best badge pops on, saying what it beat: on the Dashboard's Hours and Today blocks, and on Focus's Session done card. Press +10 min. When today's hours are met it is a perfect day: the Hours block gets a gold edge and a Perfect day stamp thumps down. Confetti bursts for the big ones only: a project's last task ticked, a milestone finished, and the moment the day turns perfect. These are pretend.">
            <WinsSpecimen />
          </Section>

          <Section title="Moments" sub="29-1P14b. Three moments on the Dashboard. From 8pm, a calm indigo card recaps the day: one line that sums it up, the time focused, when you focused from 6am to now, any new best in gold, and three numbers; close it and it comes back tomorrow night. After three or more days away (on both devices), BASE opens on a hello first: how long it has been, what changed in one line, and one small task to start with. On your birthday (Settings, App, Your birthday), Diwali, 1 January and BASE's birthday (11 September), the greeting dresses up. These are pretend.">
            <MomentsSpecimen />
          </Section>

          <Section title="Your month, wrapped" sub="29-1P14e1 and e2. From the 1st to the 7th of each month, a card on the Dashboard offers last month as a story; press Play. It moves on by itself: the cover, the hours you focused against the month before, your top five projects in their own colours, the two hours of the day you focus best, your best day lit gold on the calendar, the task you pushed most stamped with how many times, your focus type (when in the day, and how long you sit), and the summary, whose Share makes a picture of it for the tablet's share sheet (saved, on the laptop). In January a second, bigger card offers last year the same way, with its months in place of a calendar. Tap the right of the story to go on, the left third to go back, hold to pause; arrows and Space on a keyboard. Reaching the summary, or the card's x, puts it away. A page with nothing to say is skipped. These are pretend.">
            <MonthWrappedSpecimen />
          </Section>

          <Section title="Words and empty screens" sub="29-1P14c. Short sentences are grey with only the words that matter in white, so the point lands in one glance; the first time you see one after opening BASE, those words light up one after another, once. A screen with nothing on it gets a small line drawing, one kind sentence and the next step: a paper plane on an empty board, a leaf on Set Deadlines with nothing chosen, a calm sea when every task is filled in, a magnifying glass when a search finds nothing. Press Replay, and pick an empty screen. These are pretend.">
            <WordsSpecimen />
          </Section>

          <Section title="Waiting and notices" sub="29-1P14d1. When the tablet loses the internet, a small grey pill at the top says Offline, saving on this tablet: everything still works and is kept. When it is back the pill turns lime, says how many changes reached the cloud, and slips away. Several notices at the top pile up into one: the most important in front, the others tucked behind it, at most three (a fourth waits its turn). Point at the pile, or tap it, to fan them out. These are pretend.">
            <NoticesSpecimen />
          </Section>

          <Section title="Placeholders and numbers" sub="29-1P14d2. While a screen waits on the laptop or the cloud, grey shapes in the layout of what is coming glimmer softly, then the real rows fade in over them: no spinner, no jump, and the glimmer stops the moment they arrive. The last two progress rings are their numbers now.">
            <PlaceholdersSpecimen />
          </Section>

          <Section title="Atlas at work" sub="29-1P15a. While Atlas works, the edges of what it works in glow violet, the colour travelling round them, and its working line has a soft light running through it. Its answer is written out a word at a time behind a violet caret, even when it arrives all at once, and the light fades as it answers. In the chat, the side panel and dock mode; nothing moves once it is done. Press Ask. This is pretend.">
            <AtlasAtWorkSpecimen />
          </Section>

          <Section title="Atlas at rest" sub="29-1P15b. Atlas's screen sits above a curved horizon of violet light, like a planet's edge, in the chat before the first message and in dock mode; while Atlas listens it brightens. A box that asks Atlas glows violet underneath while you type in it (the chat, the side panel, Ctrl+K), and fades when it is empty. When Atlas saves something about you, a small violet Remembered chip lands under its reply; tap it to open the note. Nothing here moves on its own. Press Listen, type in the box. This is pretend.">
            <AtlasAtRestSpecimen />
          </Section>

          <Section title="Long jobs and the mic" sub="29-1P15d. When Atlas works for more than five seconds, soft violet light drifts inside its working pill and the seconds count up at its end; short answers look as before, and the light goes with the pill. The mic beside Send stretches into a timer while it listens: minutes, a glowing violet light, seconds. When your words land in the box the light turns lime, then it folds back into the mic. It stops listening by itself after two minutes. Dock mode shows the same timer, larger, under the orb while it hears you. Press Run a long job, press the mic. This is pretend.">
            <AtlasLongJobSpecimen />
          </Section>

          <Section title="Focus ring" sub="On the laptop: click the box, then press Tab. One lime ring glides from control to control.">
            <Card>
              <div style={{ display: 'grid', gap: 'var(--sp-5)', maxWidth: 520 }}>
                <Input placeholder="Task name" aria-label="Task name" />
                <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                  <SoftButton>Today</SoftButton>
                  <SoftButton>Tomorrow</SoftButton>
                  <SoftButton>Pick date</SoftButton>
                </div>
              </div>
            </Card>
          </Section>

          <Section title="Dashboard" sub="The Dashboard's own pieces. Press them: each moves once, when something changes, and then sits still.">
            <DashboardSpecimens />
          </Section>

          <Section title="Dark tint" sub="A trace of one colour in every dark grey. Also in Settings → App, and the same on both devices.">
            <Card>
              <DarkTintPicker />
            </Card>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 'var(--sp-6)' }}>
      <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
        <h2 style={{ font: 'var(--type-title)', fontSize: 'var(--text-xl)', letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)' }}>
          {title}
        </h2>
        <p style={{ font: 'var(--type-body)', color: 'var(--fg-3)', textWrap: 'pretty' }}>{sub}</p>
      </div>
      {children}
    </section>
  );
}

/** The green split, side by side: what keeps emerald and what moved to lime. */
function RunningOrDone() {
  const [ticked, setTicked] = useState(true);
  return (
    <div style={GRID}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)', justifyItems: 'start' }}>
          <span className="ag-kicker" style={{ color: 'var(--job-emerald)' }}>Emerald · running now</span>
          <StatusPill status="running">Running</StatusPill>
          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            A timer that is going, a live share. Nothing else; Atlas working is violet.
          </p>
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)', justifyItems: 'start' }}>
          <span className="ag-kicker" style={{ color: 'var(--job-lime)' }}>Lime · done, ticked, chosen</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
            <Checkbox checked={ticked} onChange={setTicked} label="Tick me" />
            <StatusPill status="done">Done</StatusPill>
          </div>
          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            A tick, a progress bar, the row you picked, the page you are on, a text box you are typing in.
          </p>
        </div>
      </Card>
    </div>
  );
}

function ErrorsWarningsDates() {
  return (
    <div style={GRID}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)', justifyItems: 'start' }}>
          <span className="ag-kicker" style={{ color: 'var(--job-coral)' }}>Coral · failed, over, about to be missed</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
            <StatusPill status="overrun" size="sm">Red alert</StatusPill>
            <MetaKicker icon="calendar" tone="var(--job-coral-tag-fg)">Overdue</MetaKicker>
          </div>
          <Input invalid defaultValue="Not a date" aria-label="A box with a mistake in it" />
          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            Errors, delete, over time, Red Alert, an emergency, a due date under a day away.
          </p>
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)', justifyItems: 'start' }}>
          <span className="ag-kicker" style={{ color: 'var(--status-warn)' }}>Grey · needs a look</span>
          <StatusPill status="review" size="sm">Needs time</StatusPill>
          <WarnLine>The assistant is switched off for this account.</WarnLine>
          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            No colour, so the triangle is the signal. Yellow is saved for gold, which is rewards.
          </p>
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)', justifyItems: 'start' }}>
          <span className="ag-kicker" style={{ color: 'var(--job-sky)' }}>Sky · dates and reminders</span>
          <MetaKicker icon="calendar" iconTone="var(--job-sky)">Due in 3d</MetaKicker>
          <GelButton colour="sky" size="md" icon={<Icon name="refresh-cw" size={14} />}>Try again</GelButton>
          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            A due date's calendar, when the session ends, the plan's timeline, the next reminder.
          </p>
        </div>
      </Card>
    </div>
  );
}

/** Violet, teal and the white dial (29-1P2c3), each as it is drawn in the app. */
function AtlasFocusJudgement() {
  const [level, setLevel] = useState(60);
  const [importance, setImportance] = useState<number | undefined>(6);
  return (
    <div style={GRID}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)', justifyItems: 'start' }}>
          <span className="ag-kicker" style={{ color: 'var(--job-violet)' }}>Violet · Atlas</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
            <span
              aria-hidden="true"
              style={{
                display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: '50%',
                backgroundImage: 'var(--glass-tint-violet)', boxShadow: 'var(--glass-rim-2), var(--job-violet-shine)',
                color: 'var(--job-violet-text)',
              }}
            >
              <Icon name="sparkles" size={14} />
            </span>
            <SoftIconButton label="Ask Atlas" className="ds-ask"><Icon name="sparkles" size={18} /></SoftIconButton>
            <IconButton label="Send" variant="tint" tone="violet"><Icon name="arrow-up" size={17} /></IconButton>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--job-violet)', boxShadow: '0 0 10px var(--job-violet)' }} />
            <span className="ag-kicker" style={{ color: 'var(--job-violet-tag-fg)' }}>Waiting on you</span>
          </span>
          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            Its mark, every Ask AI button, Send, an approval, a question it asks, Thinking, Dock mode listening.
          </p>
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
          <span className="ag-kicker" style={{ color: 'var(--job-teal)' }}>Teal · Focus</span>
          <div
            style={{
              display: 'grid', placeItems: 'center', minHeight: 64, borderRadius: 'var(--r-card)',
              backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-shadow-pane), var(--job-teal-shine-md)',
              font: 'var(--type-numeric)', fontSize: 'var(--text-xl)', color: 'var(--fg-1)',
            }}
          >
            24:13
          </div>
          <Slider tone="teal" label="Level" value={level} min={0} max={100} format={(v) => `${v}%`} onValueChange={setLevel} />
          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            Focus's stage while it runs, and brown noise. The run pill and the strip stay emerald: running now.
          </p>
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
          <span className="ag-kicker" style={{ color: 'var(--fg-2)' }}>White · your judgement</span>
          <HumanOverridePicker value={importance} onChange={setImportance} compact />
          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            The Importance dial brightens, it does not change colour. Hidden from shared links is grey, with its eye.
          </p>
        </div>
      </Card>
    </div>
  );
}

function ColourCard({ colour }: { colour: ColourJob }) {
  const info = COLOUR_JOB_INFO[colour];
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>
          <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: `var(--job-${colour})` }} />
          {info.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
          <GelButton colour={colour} size="md">Start</GelButton>
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', height: 24, padding: '0 var(--sp-4)',
              borderRadius: 'var(--r-2xs)', font: 'var(--type-caption)', fontWeight: 'var(--weight-medium)',
              color: `var(--job-${colour}-tag-fg)`, backgroundColor: `var(--job-${colour}-tag)`,
            }}
          >
            Tag
          </span>
        </div>
        <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}>{info.job}</span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{info.where}</span>
      </div>
    </Card>
  );
}

function ButtonCard({ name, use, children }: { name: string; use: string; children: ReactNode }) {
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-5)', alignContent: 'start' }}>
        <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>{name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap', minHeight: 60 }}>{children}</div>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>{use}</span>
      </div>
    </Card>
  );
}

function Buttons() {
  const [pure, setPure] = useState(true);
  const [view, setView] = useState('Day');
  const [overdue, setOverdue] = useState(false);
  return (
    <div style={GRID}>
      <ButtonCard name="Gel with a tile" use="THE one main action on a screen, in its job's colour. One per screen.">
        <GelButton>Start</GelButton>
      </ButtonCard>
      <ButtonCard name="Gel, plain" use="A strong action without the tile: Smart Start, New task, Mark done.">
        <GelButton tile={false} colour="lime" size="md">Mark done</GelButton>
      </ButtonCard>
      <ButtonCard name="Soft raised" use="Everyday second actions: Edit, + Add widget, Not now. Presses in while held.">
        <SoftButton>Not now</SoftButton>
        <SoftButton>Edit</SoftButton>
      </ButtonCard>
      <ButtonCard name="Soft toggle" use="An on/off among buttons, pressed in while on: Focus's pure-focus toggles.">
        <SoftToggle pressed={pure} onPressedChange={setPure}>Pure focus {pure ? 'on' : 'off'}</SoftToggle>
      </ButtonCard>
      <ButtonCard name="Segmented, pressed-in" use="One of a few views: Board / List, Day / Week / Month.">
        <SegmentedControl look="soft" options={['Day', 'Week', 'Month']} value={view} onChange={setView} />
      </ButtonCard>
      <ButtonCard name="Solid white" use="A strong but calm confirm: Save changes, the end of a sheet.">
        <WhiteButton>Save changes</WhiteButton>
      </ButtonCard>
      <ButtonCard name="Round soft icon" use="One icon in a circle: the ↗ in a block's corner, header icons.">
        <SoftIconButton label="Open"><Icon name="arrow-up-right" size={18} /></SoftIconButton>
        <SoftIconButton label="Ask Atlas" className="ds-ask"><Icon name="sparkles" size={18} /></SoftIconButton>
      </ButtonCard>
      <ButtonCard name="Floating +" use="Quick add from anywhere, on the tablet. Android's floating action button.">
        <FloatingAddButton label="Quick add" />
      </ButtonCard>
      <ButtonCard name="Split button" use="One action and its variants. The big half does the usual way; the arrow opens the rest.">
        <SplitButton
          moreLabel="More ways to start"
          onClick={() => {}}
          size="md"
          variants={[{ label: 'Start 25 min' }, { label: 'Start with prep' }]}
        >
          Start
        </SplitButton>
      </ButtonCard>
      <ButtonCard name="Hold to confirm" use="Only what must not happen by accident: emptying the Trash, deleting a project. Nothing is emptied here.">
        <HoldToConfirm onConfirm={() => {}} doneLabel="Emptied">Hold to empty Trash</HoldToConfirm>
      </ButtonCard>
      <ButtonCard name="Slide to start" use="Committing to something big: any session of 90 minutes or more, New Session's Start included.">
        <SlideToStart onConfirm={() => {}}>Slide to start deep work</SlideToStart>
      </ButtonCard>
      <ButtonCard name="Dot arrow link" use="Every “See all”: quiet text that leads somewhere else.">
        <DotArrowLink>See every overdue task</DotArrowLink>
      </ButtonCard>
      <ButtonCard name="Chip with a count" use="A filter that says how many are behind it. The count wears what it counts: coral for overdue.">
        <CountChip count={6} colour="coral" pressed={overdue} onClick={() => setOverdue((v) => !v)}>Overdue</CountChip>
      </ButtonCard>
      {/* 29-1P2: the pieces that putting the buttons on every screen needed. */}
      <ButtonCard name="Small sizes" use="36px, for small controls on one line with what they change: Focus's +5m, a list's Add task.">
        <SoftButton size="sm">+5m</SoftButton>
        <WhiteButton size="sm" icon={<Icon name="plus" size={14} />}>Add task</WhiteButton>
        <SoftIconButton size="sm" label="Search"><Icon name="search" size={16} /></SoftIconButton>
      </ButtonCard>
      <ButtonCard name="Counts on the nav" use="A number on its cell, coral when it is urgent (Red Alert on Home), neutral when it is only a count (Score).">
        <MiniNav
          value="home"
          onChange={() => {}}
          screenLit
          items={[
            { value: 'home', label: 'Home', icon: <Icon name="house" size={20} />, badge: 3, badgeColour: 'coral', badgeNote: '3 on red alert', light: 'emerald' },
            { value: 'score', label: 'Score', icon: <Icon name="award" size={20} />, badge: 12, badgeColour: 'neutral', badgeNote: '12 need attention', light: 'coral' },
          ]}
        />
      </ButtonCard>
      <ButtonCard name="Hold, in a menu" use="Deleting a project from its ⋯: the confirm is held, never tapped. Nothing is deleted here.">
        <MorphMenu
          portal
          trigger={<SoftIconButton label="Actions"><Icon name="ellipsis" size={18} /></SoftIconButton>}
          items={[{
            value: 'delete', label: 'Delete project', tone: 'danger', icon: <Icon name="trash-2" size={18} />,
            confirm: { label: 'Delete Studio Launch?', hint: 'Recoverable from Trash for 30 days.', hold: true, onConfirm: () => {} },
          }]}
        />
      </ButtonCard>
    </div>
  );
}

function NumberCard({ tone, value, label }: { tone: 'focus' | 'streak' | 'done'; value: string; label: string }) {
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
        <GradientNumber tone={tone}>{value}</GradientNumber>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{label}</span>
      </div>
    </Card>
  );
}

function SwitchCard() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  const [c, setC] = useState(true);
  const row = (label: string, on: boolean, set: (v: boolean) => void) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-5)', minHeight: 44 }}>
      <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)' }}>{label}</span>
      <Switch checked={on} onChange={set} aria-label={label} />
    </div>
  );
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-3)', maxWidth: 520 }}>
        {row('Counts toward hours', a, setA)}
        {row('Remind me the night before', b, setB)}
        {row('Show in the morning story', c, setC)}
      </div>
    </Card>
  );
}

/** 117-123 and 132: the sounds, the buzzes, a slider that clicks and the knob. */
const SOUNDS: Array<[Cue, string, string]> = [
  ['tick', 'Tick', 'Every tick box. Press it fast, five times: it climbs.'],
  ['done', 'Done', 'Mark done in Focus.'],
  ['cleared', 'List cleared', 'The last open step, or the session\u2019s last task.'],
  ['start', 'Start', 'Every Start and every slide.'],
  ['flowChime', 'Session end', 'The bowl, softly. It swells for a second and rings out once; then Focus turns gold and counts up.'],
  ['delete', 'Delete', 'A confirmed or held delete.'],
  ['error', 'Error', 'Something you just pressed failed.'],
  ['streak', 'Streak', 'Kept for the streaks, later.'],
  ['undo', 'Undo', 'Something put back: the toast’s Undo, Ctrl+Z, two fingers.'],
  ['redo', 'Redo', 'Put forward again: Ctrl+Shift+Z, three fingers.'],
];
const BUZZES: Array<[BuzzName, string]> = [
  ['tick', 'Tick'], ['done', 'Done'], ['sessionEnd', 'Session end'], ['error', 'Error'], ['nudge', 'Break'],
];

function UndoSpecimen() {
  const [run, setRun] = useState(0);
  return (
    <div style={GRID}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)', justifyItems: 'start' }}>
          <Toast
            key={run}
            icon={<Icon name="check" size={16} />}
            title={'Ticked “Oil Hair”'}
            action={{ label: 'Undo', onClick: () => setRun((n) => n + 1) }}
            drainMs={5000}
            onDismiss={() => setRun((n) => n + 1)}
          />
          <SoftButton size="sm" onClick={() => setRun((n) => n + 1)}>Replay</SoftButton>
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>Three ways back</span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            The toast’s Undo, after a tick, a delete, a move or an archive. Ctrl+Z on the laptop, Ctrl+Shift+Z or Ctrl+Y to redo.
            On the tablet, tap anywhere with two fingers to undo and three to redo; a small bubble says what came back.
          </span>
        </div>
      </Card>
    </div>
  );
}

/** The real board tick on three made-up tasks — nothing here is saved. */
function TickSpecimen() {
  const [done, setDone] = useState<Record<string, boolean>>({});
  const tasks = ['Oil Hair', 'Drink protein shake', 'Ashwagandha + Magnesium'];
  return (
    <div style={GRID}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
          {tasks.map((t) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minHeight: 32 }}>
              <Tick
                done={!!done[t]}
                label={done[t] ? `Mark ${t} not done` : `Mark ${t} done`}
                onToggle={() => setDone((d) => ({ ...d, [t]: !d[t] }))}
              />
              <span style={{ font: 'var(--type-body)', color: done[t] ? 'var(--fg-3)' : 'var(--fg-1)', transition: 'color var(--dur-base) var(--ease-glass)' }}>
                <Strike on={!!done[t]}>{t}</Strike>
              </span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>Which ticks cheer</span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            A task's tick, on a board or in the list view: the +1, the run of ticks, and one more on the Dashboard's
            gold count of what you finished today. A subtask's tick draws and pops but floats no +1, and picking a
            task for today only pops — that is choosing, not finishing.
          </span>
        </div>
      </Card>
    </div>
  );
}

/* The lights, as `screenLight.css` sets them, each on a small page of its
   own — an inline `--screen-light` outranks the rule keyed on <html>. */
const LIGHTS: Array<[string, string, string]> = [
  ['Home, boards, New Session', 'var(--job-emerald)', '/'],
  ['Focus', 'var(--job-teal)', '/focus'],
  ['Atlas', 'var(--job-violet)', '/chat'],
  ['Deadlines, Notifications', 'var(--job-sky)', '/notifications'],
  ['Score', 'var(--job-coral)', '/scoring'],
  ['Settings', 'var(--screen-light-neutral)', '/settings'],
];
const SKIES: Array<[string, string, string, string]> = [
  ['Morning', 'var(--job-orange)', 'var(--job-coral)', 'var(--job-sky)'],
  ['Afternoon', 'var(--job-sky)', 'var(--job-teal)', 'var(--job-indigo)'],
  ['Evening', 'var(--job-rose)', 'var(--job-orange)', 'var(--job-violet)'],
  ['Night', 'var(--job-indigo)', 'var(--job-violet)', 'oklch(0.5 0.1 265)'],
];
const LIGHT_TILE: CSSProperties = {
  minHeight: 120, borderRadius: 'var(--r-lg)', overflow: 'hidden', display: 'flex', alignItems: 'flex-end',
  padding: 'var(--sp-6)', border: 0, boxShadow: 'var(--glass-rim-1)', cursor: 'pointer',
  font: 'var(--type-label)', color: 'var(--fg-1)', textAlign: 'left',
};

function ScreenLights() {
  const navigate = useNavigate();
  const [hour, setHour] = useState(0);
  const [, lead, b, c] = SKIES[hour];
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
      <div style={GRID}>
        {LIGHTS.map(([name, colour, to]) => (
          <button key={name} type="button" className="ag-page" onClick={() => navigate(to)}
            style={{ ...LIGHT_TILE, ['--screen-light' as string]: colour } as CSSProperties}>
            {name}
          </button>
        ))}
      </div>
      <div className="ag-page ag-page--sky"
        style={{ ...LIGHT_TILE, minHeight: 180, cursor: 'default', justifyContent: 'space-between', gap: 'var(--sp-5)',
          ['--screen-light' as string]: lead, ['--sky-b' as string]: b, ['--sky-c' as string]: c } as CSSProperties}>
        <span style={{ font: 'var(--weight-light) var(--text-2xl) / 1 var(--font-display)' }}>{SKIES[hour][0]}</span>
        <SoftButton onClick={() => setHour((h) => (h + 1) % SKIES.length)}>Play the day</SoftButton>
      </div>
    </div>
  );
}

/* 29-1P6a's specimens: a row whose sheet grows out of it, and a menu to hold and slide. */
const WHENS: Array<{ value: string; label: string; icon: IconName; keys?: string[] }> = [
  { value: 'today', label: 'Today', icon: 'calendar', keys: ['g', 'd'] },
  { value: 'evening', label: 'This evening', icon: 'moon', keys: ['g', 'h'] },
  { value: 'tomorrow', label: 'Tomorrow', icon: 'arrow-right', keys: ['n'] },
  { value: 'someday', label: 'Someday', icon: 'ellipsis' },
];

function SheetsSpecimen() {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState('Today');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-6)', maxWidth: 960 }}>
      <Card>
        <button
          type="button"
          data-sheet-specimen=""
          onClick={() => setOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', width: '100%', minHeight: 52,
            padding: '0 var(--sp-5)', border: 0, borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
            backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-rim-1)',
            color: 'var(--fg-1)', font: 'var(--type-body)',
          }}
        >
          <Icon name="circle" size={16} style={{ color: 'var(--fg-4)' }} />
          <span style={{ flex: 1 }}>Draft the pitch deck</span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--job-sky)' }}>Fri</span>
        </button>
        <Dialog open={open} onClose={() => setOpen(false)} width={560} label="Draft the pitch deck" growFrom="[data-sheet-specimen]">
          <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
            <span style={{ font: 'var(--type-title)', color: 'var(--fg-1)' }}>Draft the pitch deck</span>
            <span style={{ font: 'var(--type-body)', color: 'var(--fg-3)' }}>Three slides left: pricing, team, the ask.</span>
            <div><WhiteButton onClick={() => setOpen(false)}>Close</WhiteButton></div>
          </div>
        </Dialog>
      </Card>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
          <span style={{ flex: 1, font: 'var(--type-body)', color: 'var(--fg-2)' }}>Studio lease — <b style={{ color: 'var(--fg-1)', fontWeight: 'var(--weight-medium)' }}>{when}</b></span>
          <MorphMenu
            portal
            align="end"
            width={230}
            items={WHENS.map((w) => ({
              value: w.value, label: w.label, icon: <Icon name={w.icon} size={16} />, shortcut: w.keys,
              onSelect: () => setWhen(w.label),
            }))}
            trigger={(
              <SoftButton size="sm">
                When
                <Icon name="chevron-down" size={12} />
              </SoftButton>
            )}
          />
        </div>
      </Card>
    </div>
  );
}

/** 29-1P6b's three, live: swipe (a finger), hold to peek (the first open task), throw away. */
function HoldFlickSpecimen() {
  const [done, setDone] = useState(false);
  const [starts, setStarts] = useState<string | null>(null);
  const [toastGone, setToastGone] = useState(false);
  const [cardGone, setCardGone] = useState(false);
  const first = useStore((s) => s.backlogTasks.find((t) => t.status !== 'completed'));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-6)', maxWidth: 960 }}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span className="ag-kicker">Swipe · a finger</span>
          <SwipeRow
            radius="var(--r-md)"
            right={doneSide(done, false, () => setDone((d) => !d))}
            left={tomorrowSide(done, () => setStarts('Starts tomorrow'))}
          >
            <div
              data-swipe-specimen=""
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minHeight: 52, padding: '0 var(--sp-5)',
                borderRadius: 'var(--r-md)', backgroundImage: 'var(--glass-fill-2)', backgroundColor: 'var(--glass-floor)',
                boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-1)', font: 'var(--type-body)',
              }}
            >
              <Icon name={done ? 'check' : 'circle'} size={16} style={{ color: done ? 'var(--job-lime)' : 'var(--fg-4)' }} />
              <Strike on={done}>Apply Minoxidil</Strike>
            </div>
          </SwipeRow>
          <span style={{ font: 'var(--type-caption)', color: starts ? 'var(--job-sky)' : 'var(--fg-4)' }}>{starts ?? 'Right: Done. Left: Tomorrow.'}</span>
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-4)', gridTemplateColumns: 'minmax(0, 1fr)' }}>
          <span className="ag-kicker">Hold to peek</span>
          {first ? (
            <button
              type="button"
              {...peekAttr(first.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', width: '100%', minHeight: 52, padding: '0 var(--sp-5)',
                border: 0, borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
                backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-1)', font: 'var(--type-body)',
              }}
            >
              <Icon name="circle" size={16} style={{ color: 'var(--fg-4)' }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{first.title}</span>
              <span style={{ flex: '0 0 auto', font: 'var(--type-caption)', color: 'var(--fg-4)' }}>hold me</span>
            </button>
          ) : (
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>Add a task to peek at one.</span>
          )}
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-4)', justifyItems: 'start' }}>
          <span className="ag-kicker">Throw it away</span>
          {toastGone ? (
            <SoftButton size="sm" onClick={() => setToastGone(false)}>Bring the toast back</SoftButton>
          ) : (
            <Toast data-fling-specimen="" style={{ minWidth: 0, maxWidth: '100%' }} icon={<Icon name="check" size={16} />} title="Calendar synced" detail="Flick me sideways" onDismiss={() => setToastGone(true)} />
          )}
          {cardGone ? (
            <SoftButton size="sm" onClick={() => setCardGone(false)}>Bring the notice back</SoftButton>
          ) : (
            <NotificationCard
              style={{ width: '100%' }}
              tone="review"
              icon={<Icon name="calendar-clock" size={16} />}
              title="2 deadlines moved"
              body="A prerequisite now finishes after them."
              onThrow={() => setCardGone(true)}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

/* 29-1P7a: one badge at a time, a score that warms, calendar pages that warm and flip. */
const PAGE_DAYS = [0, 1, 4, 9, 30];
function BadgesDatesSpecimen() {
  const [score, setScore] = useState(14);
  const [days, setDays] = useState(PAGE_DAYS);
  const [now] = useState(() => Date.now());
  const timeZone = resolveUserTimeZone();
  const peak = 20;
  const badgeRow = (title: string, items: Parameters<typeof BadgeFold>[0]['items']) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)', padding: 'var(--sp-5)', borderRadius: 'var(--r-xs)', backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)' }}>
      <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', color: 'var(--fg-1)' }}>{title}</span>
      <BadgeFold items={items} />
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-6)', maxWidth: 960 }}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span className="ag-kicker">One badge at a time</span>
          {badgeRow('Rewrite the landing page copy', [
            { key: 'a', node: <StatusPill status="overrun" size="sm">Red alert</StatusPill> },
            { key: 'e', node: <EmergencyMark level={3} /> },
            { key: 's', node: <ScoreDial value={21.3} max={peak} alert size="sm" /> },
          ])}
          {badgeRow('File the incorporation paperwork', [
            { key: 'e', node: <EmergencyMark level={2} /> },
            { key: 's', node: <ScoreDial value={14.3} max={peak} size="sm" /> },
          ])}
          {badgeRow('Hero section', [{ key: 's', node: <ScoreDial value={6.1} max={peak} size="sm" /> }])}
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
          <span className="ag-kicker">Scores that feel warm</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
            {[3, 7, 10, 13, 16, 20].map((v) => <ScoreDial key={v} value={v} max={peak} size="sm" />)}
            <ScoreDial value={21.3} max={peak} alert size="sm" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
            <ScoreDial value={score} max={peak} size="lg" showMax />
          </div>
          <Slider label="Score" value={score} min={0} max={peak} step={0.5} format={(v) => v.toFixed(1)} onValueChange={setScore} />
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span className="ag-kicker">Dates as tiny calendar pages</span>
          {days.map((d, i) => {
            const at = new Date(now + d * 86_400_000);
            const due = readDue(toTaskDateString(new Date(at.setHours(18, 0, 0, 0)), timeZone), new Date(now), timeZone);
            if (!due) return null;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setDays((all) => all.map((x, j) => (j === i ? x + 1 : x)))}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', padding: 'var(--sp-3) var(--sp-4)', border: 0, borderRadius: 'var(--r-xs)', backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)', cursor: 'pointer', textAlign: 'left' }}
              >
                <DatePage month={due.month} day={due.day} dayKey={due.dayKey} warmth={due.warmth} size="md" />
                <span style={{ display: 'grid', gap: 2 }}>
                  <span style={{ font: 'var(--type-body)', color: 'var(--fg-1)' }}>{['File the paperwork', 'Pay the advance', 'Landing page copy', 'Quarterly review', 'Tax filing'][i]}</span>
                  <span style={{ font: 'var(--type-caption)', color: due.urgent ? 'var(--job-coral-tag-fg)' : 'var(--fg-3)' }}>{due.words}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* 29-1P7b: cards that fill as their steps get done, dots on a line, ticked
   from the card. Local state only — the board's own rows write the store. */
function StepsSpecimen() {
  const [steps, setSteps] = useState([
    { title: 'Scan the signed pages', done: true },
    { title: 'Attach the digital signature', done: false },
    { title: 'Submit on the portal', done: false },
  ]);
  const [open, setOpen] = useState(true);
  const boxes = useRef<Array<HTMLSpanElement | null>>([]);
  const doneCount = steps.filter((x) => x.done).length;
  const card = (title: string, done: number, total: number, extra?: ReactNode, isOpen = false, onToggle?: () => void) => (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-3)', padding: 'var(--sp-5) var(--sp-6)', borderRadius: 'var(--r-xs)',
        ...withStepWash('var(--glass-fill-1)', done, total), boxShadow: 'var(--glass-rim-1)',
        transition: STEP_WASH_TRANSITION,
      }}
    >
      <span style={{ font: 'var(--type-body)', color: 'var(--fg-1)' }}>{title}</span>
      <span style={{ display: 'flex' }}>
        <StepTrack done={done} total={total} open={isOpen} onToggle={onToggle ?? (() => {})} title={title} />
      </span>
      {extra}
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-6)', maxWidth: 960 }}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span className="ag-kicker">Cards fill as you go</span>
          {card('Upload to the MCA portal', 4, 5)}
          {card('Rewrite the landing page copy', 1, 3)}
          {card('Prepare the pitch deck', 2, 8)}
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span className="ag-kicker">Tick steps from the card</span>
          {card('File the incorporation paperwork', doneCount, steps.length, open && (
            <div style={{ display: 'grid', gap: 'var(--sp-2)', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--line-faint)' }}>
              {steps.map((st, i) => (
                <button
                  key={st.title}
                  type="button"
                  aria-pressed={st.done}
                  onClick={() => {
                    cue(st.done ? 'untick' : 'tick');
                    if (!st.done) popTick(boxes.current[i]);
                    setSteps((all) => all.map((x, j) => (j === i ? { ...x, done: !x.done } : x)));
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minHeight: 28, padding: 0, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}
                >
                  <TickBox ref={(el) => { boxes.current[i] = el; }} done={st.done} size={16} />
                  <span style={{ font: 'var(--type-caption)', color: st.done ? 'var(--fg-4)' : 'var(--fg-2)' }}>
                    <Strike on={st.done}>{st.title}</Strike>
                  </span>
                </button>
              ))}
            </div>
          ), open, () => setOpen((v) => !v))}
        </div>
      </Card>
    </div>
  );
}

/* 29-1P6c: a card that tilts, and the pull's pill at rest, halfway and armed. */
function DragScrollSpecimen() {
  const card = useRef<HTMLDivElement>(null);
  useTilt(card);
  const pill = (fill: number, armed: boolean, words: string) => (
    <div className="ag-pull-pill" data-armed={armed ? 'true' : 'false'} style={{ position: 'relative', top: 0, left: 0, translate: 'none', width: 'fit-content' }}>
      <i style={{ scale: `${fill} 1` }} />
      <svg width="14" height="14" viewBox="0 0 14 14" style={{ rotate: armed ? '180deg' : '0deg' }}>
        <path d="M7 2v10M3 8l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{words}</span>
    </div>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-6)', maxWidth: 960 }}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span className="ag-kicker">Cards that tilt · a mouse</span>
          <div
            ref={card}
            className="ag-tilt"
            style={{
              position: 'relative', display: 'grid', alignContent: 'end', gap: 'var(--sp-2)', height: 150, padding: 'var(--sp-6)',
              borderRadius: 'var(--r-card)', backgroundImage: 'var(--glass-fill-2)', backgroundColor: 'var(--glass-floor)',
              boxShadow: 'var(--glass-rim-2), var(--glass-cast-2)',
            }}
          >
            <span className="ag-tilt-shine" aria-hidden="true" />
            <span style={{ font: 'var(--type-title)', color: 'var(--fg-1)' }}>Shreekant Empire</span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>1 of 5 done</span>
          </div>
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)', justifyItems: 'start' }}>
          <span className="ag-kicker">Pull for the Backburner · a finger</span>
          {pill(0, false, 'Pull for Backburner')}
          {pill(0.55, false, 'Pull for Backburner')}
          {pill(1, true, 'Let go')}
        </div>
      </Card>
    </div>
  );
}

/* 29-1P5c's specimens: the idea page's own rows and days. */
const GLIDE_ROWS: Array<[string, string, number | null]> = [
  ['Dashboard', 'var(--job-orange)', null],
  ['Tasks', 'var(--job-emerald)', 14],
  ['Deadlines', 'var(--job-sky)', 3],
  ['Focus', 'var(--job-teal)', null],
  ['Atlas', 'var(--job-violet)', null],
];
const DAYS = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'This week' },
];
const DAY_TASKS: Record<string, string[]> = {
  today: ['Oil hair', 'Landing page copy', 'Call the CA'],
  tomorrow: ['Gym', 'Pitch deck', 'Studio lease', 'Book the venue'],
  week: ['Weekly review', 'Mid-sem revision', 'Plan next week'],
};

function MovingSpecimen() {
  const { pad, hostProps } = useGlide();
  const [day, setDay] = useState('today');
  const [playing, setPlaying] = useState(false);
  const [adding, setAdding] = useState(false);
  const [back, setBack] = useState(false);
  const rowStyle: CSSProperties = {
    position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 'var(--sp-5)',
    minHeight: 40, padding: '0 var(--sp-5)', borderRadius: 'var(--r-sm)', color: 'var(--fg-2)', font: 'var(--type-body)',
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-6)', maxWidth: 960 }}>
      <Card>
        <div {...hostProps} style={{ position: 'relative', display: 'grid', gap: 2 }}>
          <span ref={pad} className="ag-glide" aria-hidden="true" />
          {GLIDE_ROWS.map(([name, colour, count]) => (
            <div key={name} data-glide="" style={rowStyle}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: colour }} />
              {name}
              {count !== null && <span style={{ marginLeft: 'auto', font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{count}</span>}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
          <SegmentedControl look="soft" size="sm" options={DAYS} value={day} onChange={setDay} />
          <BlurAcross value={day} index={DAYS.findIndex((d) => d.value === day)} style={{ display: 'grid', gap: 'var(--sp-3)' }}>
            {DAY_TASKS[day].map((t) => (
              <span key={t} style={{ ...rowStyle, minHeight: 36, backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)' }}>{t}</span>
            ))}
          </BlurAcross>
        </div>
      </Card>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
          <SoftButton icon={<MorphIcon kind="play-pause" on={playing} size={18} />} onClick={() => setPlaying(!playing)}>
            {playing ? 'Pause' : 'Resume'}
          </SoftButton>
          <FloatingAddButton open={adding} label={adding ? 'Close' : 'Add'} onClick={() => setAdding(!adding)} />
          <SoftIconButton label={back ? 'Hide chats' : 'Show chats'} onClick={() => setBack(!back)}>
            <MorphIcon kind="menu-back" on={back} size={18} />
          </SoftIconButton>
        </div>
      </Card>
      <Card>
        <div
          className="dash-block"
          onPointerMove={(e) => {
            if (e.pointerType !== 'mouse') return;
            const glow = e.currentTarget.querySelector<HTMLElement>(':scope > .dash-glow');
            const r = e.currentTarget.getBoundingClientRect();
            glow?.style.setProperty('--gx', `${e.clientX - r.left}px`);
            glow?.style.setProperty('--gy', `${e.clientY - r.top}px`);
          }}
          style={{
            position: 'relative', overflow: 'hidden', height: 140, borderRadius: 'var(--r-xl)',
            display: 'grid', placeItems: 'center', backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-shadow-pane)',
            font: 'var(--type-caption)', color: 'var(--fg-3)',
          }}
        >
          Point here
          <span className="dash-glow" aria-hidden="true" />
        </div>
      </Card>
    </div>
  );
}

/* The nav's specimen bar: four of the real seven. */
const NAV_SPECIMEN = [
  { value: 'dashboard', label: 'Dashboard', icon: <Icon name="layout-dashboard" size={20} />, light: 'hour' },
  { value: 'home', label: 'Home', icon: <Icon name="house" size={20} />, light: 'emerald' },
  { value: 'atlas', label: 'Atlas', icon: <Icon name="sparkles" size={20} />, light: 'violet' },
  { value: 'session', label: 'New Session', icon: <Icon name="zap" size={20} />, light: 'emerald' },
  { value: 'score', label: 'Score', icon: <Icon name="award" size={20} />, light: 'coral' },
  { value: 'settings', label: 'Settings', icon: <Icon name="settings" size={20} />, light: 'neutral' },
];
/* The nav's light here is set inline, which outranks the rule keyed on <html>
   and fades the same way. Settings' is the nav's silver-white, not the page's grey. */
const NAV_LIGHTS: Array<[string, string]> = [
  ['Home', 'var(--job-emerald)'],
  ['Focus', 'var(--job-teal)'],
  ['Atlas', 'var(--job-violet)'],
  ['Notifications', 'var(--job-sky)'],
  ['Score', 'var(--job-coral)'],
  ['Settings', 'var(--screen-light-nav-neutral)'],
];

function NavSpecimen() {
  const [light, setLight] = useState(0);
  const navLight = { ['--screen-light' as string]: NAV_LIGHTS[light][1] } as CSSProperties;
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-6)', maxWidth: 720 }}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-6)', justifyItems: 'start' }}>
          <MiniNav screenLit items={NAV_SPECIMEN} style={navLight} />
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            {NAV_LIGHTS.map(([name], i) => (
              <SoftButton key={name} size="sm" aria-pressed={i === light} onClick={() => setLight(i)}>{name}</SoftButton>
            ))}
          </div>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            On the tablet the rail stands upright and its dot sits on the rail's outer edge.
          </span>
        </div>
      </Card>
      <Card>
        <div style={{ display: 'flex', gap: 'var(--sp-7)', alignItems: 'flex-start' }}>
          <MiniNav screenLit orientation="vertical" items={NAV_SPECIMEN.slice(0, 4)} style={navLight} />
          <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>Layered glass icons</span>
            <div style={{ display: 'flex', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
              {LAYERED.map(([name, icon, colour]) => (
                <span key={name} className="ag-licon-host" style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-2)', font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                  <LayeredIcon icon={<Icon name={icon} size={20} />} colour={colour} size={44} />
                  {name}
                </span>
              ))}
            </div>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
              The Dashboard's widget gallery wears them, each widget in its job's colour. A widget no job claims is grey.
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}
const LAYERED: Array<[string, IconName, string | undefined]> = [
  ['One thing', 'target', 'var(--job-orange)'],
  ['Today', 'list-checks', 'var(--job-lime)'],
  ['Deadline', 'hourglass', 'var(--job-sky)'],
  ['Overdue', 'clock', 'var(--job-coral)'],
  ['Focus', 'timer', 'var(--job-teal)'],
  ['Stack', 'layers', undefined],
];

function DustSpecimen() {
  const [gone, setGone] = useState(false);
  const [count, setCount] = useState(3);
  const key = 'task:design-dust';
  return (
    <div style={GRID}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
          <div style={{ minHeight: 56 }}>
            {!gone && (
              <div
                data-dust={key}
                className="ag-card"
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minHeight: 56, padding: '0 var(--sp-5)',
                  borderRadius: 'var(--r-xs)', backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
                }}
              >
                <Tick done={false} label="Mark Old idea I will never do done" onToggle={() => {}} />
                <span style={{ font: 'var(--type-body)', color: 'var(--fg-1)', flex: 1 }}>Old idea I will never do</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-4)' }}>
            <SoftButton size="sm" disabled={gone} onClick={() => { turnToDust([key]); setGone(true); }}>Delete</SoftButton>
            <SoftButton size="sm" disabled={!gone} onClick={() => { gatherBack([key]); setGone(false); }}>Bring it back</SoftButton>
          </div>
        </div>
      </Card>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
          <CountChip count={count} colour="violet"><Icon name="hand" size={15} />Waiting</CountChip>
          <SoftButton size="sm" aria-label="One fewer" onClick={() => setCount((n) => Math.max(0, n - 1))}>−</SoftButton>
          <SoftButton size="sm" aria-label="One more" onClick={() => setCount((n) => n + (n >= 9 ? 11 : 1))}>+</SoftButton>
        </div>
      </Card>
    </div>
  );
}

function SoundTouch() {
  const [hours, setHours] = useState(6 * 3600);
  const [level, setLevel] = useState(45);
  return (
    <div style={GRID}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>BASE's sounds</span>
          {SOUNDS.map(([name, label, use]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
              <SoftButton size="sm" onClick={() => cue(name)} style={{ flex: '0 0 auto', minWidth: 112 }}>{label}</SoftButton>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>{use}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-4)', alignContent: 'start' }}>
          <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>Buzzes you can tell apart</span>
          <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            {BUZZES.map(([name, label]) => (
              <SoftButton key={name} size="sm" onClick={() => buzz(name)}>{label}</SoftButton>
            ))}
          </div>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            On the tablet only, and only if it has a motor. Each moment has its own rhythm.
          </span>
          <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)', marginTop: 'var(--sp-4)' }}>Clicks as you slide</span>
          <Slider
            label="Hours you have today"
            value={hours}
            min={0}
            max={12 * 3600}
            step={300}
            detent={3600}
            format={(s) => `${Math.floor(s / 3600)}h${s % 3600 ? ` ${Math.round((s % 3600) / 60)}m` : ''}`}
            onValueChange={setHours}
          />
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            A click at every whole hour. Pick-up, slot and drop sounds are on every drag in BASE.
          </span>
        </div>
      </Card>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-4)', justifyItems: 'center' }}>
          <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)', justifySelf: 'start' }}>A knob you turn</span>
          <Knob label="Brown noise level" value={level} step={5} onValueChange={setLevel} format={(v) => `${v}%`} />
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty', justifySelf: 'start' }}>
            Turn it in a circle. Brown noise's level, in Settings and on Focus's stage.
          </span>
        </div>
      </Card>
      <SoundSection />
    </div>
  );
}

function CurveCard({ name, curve, use }: { name: string; curve: string; use: string }) {
  const [moved, setMoved] = useState(false);
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
        <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>{name}</span>
        <div style={{ position: 'relative', height: 28, borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)' }}>
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: 4, width: 20, height: 20, borderRadius: '50%',
              left: moved ? 'calc(100% - 24px)' : 4,
              backgroundColor: 'var(--job-lime)',
              transition: `left 700ms ${curve}`,
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>{use}</span>
          <SoftButton onClick={() => setMoved((m) => !m)} icon={<Icon name="play" size={14} />}>Play</SoftButton>
        </div>
      </div>
    </Card>
  );
}

/* 29-1P8b: the pulse and the four words, on pretend numbers. The real ones
   come from `useProjectPulse`; this only shows what each looks like. */
const PULSE_STORIES: { state: HealthState; word: string; why: string; counts: number[] }[] = [
  { state: 'on-track', word: 'On track', why: 'Next due Fri 16 Oct. 19 done in the last two weeks.', counts: [0, 1, 2, 0, 3, 1, 2, 0, 1, 2, 3, 1, 2, 1] },
  { state: 'at-risk', word: 'At risk', why: '4 due by Fri 16 Oct; at this pace, about 2 will be done.', counts: [2, 3, 1, 2, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0] },
  { state: 'off-track', word: 'Off track', why: '“Send the invoice” was due Sun 11 Oct, 2 days ago.', counts: [1, 2, 0, 1, 1, 2, 0, 1, 0, 1, 2, 0, 0, 1] },
  { state: 'quiet', word: 'Quiet', why: 'Nothing done in 9 days.', counts: [1, 0, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
];

function PulseSpecimen() {
  const days = lastDays(new Date(), resolveUserTimeZone(), 14);
  return (
    <div style={GRID}>
      {PULSE_STORIES.map((story) => (
        <Card key={story.state}>
          <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
            <span style={{ justifySelf: 'start' }}>
              <StatusPill status={HEALTH_PILL[story.state]} size="sm">{story.word}</StatusPill>
            </span>
            <p style={{ font: 'var(--type-caption)', fontSize: 'var(--text-xs)', color: 'var(--fg-2)' }}>{story.why}</p>
            <PulseSquares days={days.map((day, i) => ({ day, count: story.counts[i] }))} />
            <PulseSquares days={days.map((day, i) => ({ day, count: story.counts[i] }))} size={12} label="Dashboard size" />
          </div>
        </Card>
      ))}
    </div>
  );
}
