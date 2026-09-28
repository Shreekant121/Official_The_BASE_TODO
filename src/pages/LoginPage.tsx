/**
 * Login.
 * Mockup: design-system/screens/login.html — RECONCILED (UI-28).
 *
 * WHAT THE REAL SCREEN TURNED OUT TO BE, AND WHAT WE TOOK
 * ------------------------------------------------------
 *   - **This is a sheet, not a card.** UI-6 built it on the `Card`
 *     primitive, which is level 2 by definition ("The standard level-2
 *     pane", panels.tsx) — `--glass-fill-2` + `--glass-bd-md` +
 *     rim/inner/cast. The real screen is level 3: `--glass-fill-3`,
 *     `--glass-bd-lg-refract`, `--glass-shadow-thick`. Same miss UI-21
 *     found in `Dialog`, in the same direction. `Card` is gone from this
 *     file and the surface is composed inline, which is what `Dialog`
 *     already does for the one other level-3 pane in the app.
 *   - **It refracts.** `--glass-bd-lg-refract` needs `<GlassFilters />`
 *     in the document or Chromium invalidates the whole `backdrop-filter`
 *     chain and the sheet opens with no blur at all (Dialog port note 1).
 *     The mockup mounts it on this screen; so do we. `-webkit-` keeps the
 *     plain `--glass-bd-lg`, as the source does — Safari has no filter to
 *     resolve.
 *   - **The mark sits in a tile that emits.** It was a bare 32px PNG.
 *     The real one is a 56px `--r-tile` well of `--glass-fill-2` carrying
 *     `--glass-rim-2, --glow-accent-sm`, with a 30px mark inside and an
 *     `--accent-hairline` ring running `ag-ripple` on 3.2s. `ag-ripple` is
 *     "concentric rings leaving a live source" and the glow law says a
 *     resting surface never emits — this screen is the app booting, which
 *     is the one thing `colors.css` rations emerald to mean, and the same
 *     argument App.tsx's splash already makes for its own accent.
 *   - **The kicker is the system voice at full size, in the accent.** Ours
 *     shrank `--type-system` to `--text-2xs` and painted it `--fg-3`,
 *     which is the *kicker* treatment, not the OS one. readme.md: "The
 *     system voice is bold sans at 0.30em."
 *   - **The heading is `--text-2xl`** (28px), not `--text-xl`, and the
 *     sub-line is `--type-body`/`--fg-3`, not a caption.
 *   - **"Strict focus. One task at a time."** replaces "Sign in to
 *     continue where you left off." It is the mockup's line and readme.md
 *     calls it "the best line in the product" by name.
 *   - **The primary is `frost`, not `solid`.** Button.prompt.md: "frost is
 *     the loudest option on a busy photographic or gradient backdrop —
 *     white glass always wins over accent glass there." An emerald pill on
 *     a screen lit by an emerald pool was competing with its own backdrop.
 *   - **Spacing and the divider** are the source's: `--sp-7` above the
 *     heading, `--sp-9` above the fields, `--sp-5` between them, and a
 *     footer that is `--sp-8` down, `--sp-7` of top padding and a
 *     `--line-soft` top border rather than a hand-drawn 1px `--line-faint`
 *     div with asymmetric margins.
 *   - **The backdrop is `--calm` — grid only, no pool.** UI-28 put this on
 *     `--focal` ("one pool of light behind a single object"), which is the
 *     variant the mockup uses and the one SplashScreen wears, so a cold
 *     load did not jump between backdrops. Shreekant overrode it. The
 *     reason the token misbehaves *here* specifically: `--focal` centres
 *     its pool at 50% 50%, which on this screen is exactly where the sheet
 *     is, and the sheet is the app's only level-3 surface — it refracts
 *     through `--glass-bd-lg-refract`, so it does not just sit on the pool,
 *     it magnifies it. The result was a green wash across the middle of the
 *     card, heaviest through the two input wells, reading as a light left
 *     on rather than as depth. `--calm` is the only variant that paints no
 *     pool at all; bare `.ag-page` still has one, lower and wider.
 *     What stays emerald is what was rationed on purpose: the mark's tile
 *     glow, the `ag-ripple` ring, the system-voice kicker and the Register
 *     link. NOTE — SplashScreen (App.tsx) and OAuthCallbackPage are still
 *     `--focal`, so the cold-load handoff this bullet used to close is now
 *     a step from pool to no pool.
 *
 * THE MODE SWITCH IS ONE PANE GROWING
 * -----------------------------------
 * The mockup states the claim itself: "The two modes are the same object
 * at two sizes … so switching reads as one pane growing, never as a new
 * screen." We had no morph at all — the fields simply appeared and the
 * heading crossfaded. Now the body is measured and the sheet animates its
 * own height on `--dur-morph`/`--ease-morph`, the heading re-keys through
 * `ag-condense`, and the fields condense in on the design system's
 * documented 44ms list stagger.
 *
 * Measured twice over, where the source measures once. Its
 * `useLayoutEffect` is keyed on mode alone, which is enough for a
 * prototype with two modes and nothing else in the sheet. This screen also
 * grows an error and a "check your inbox" panel, and the sheet is
 * `overflow: hidden` — a stale height does not merely skip the morph, it
 * clips the error away, and an error you cannot see is worse than no
 * animation. So the layout effect covers `mode`, `error` and `resetSent`
 * synchronously, and a `ResizeObserver` catches what this component cannot
 * know it did: a webfont landing late, a narrow window wrapping the footer.
 *
 * And it measures `offsetHeight`. The rect is in painted space and the
 * sheet's own `ag-condense` entrance holds `scale(0.94)` from the moment
 * styles resolve, so `getBoundingClientRect()` on the first pass comes back
 * 6% short — measured at 553px against a real 588, with the footer's
 * "Register" line clipped off the bottom permanently.
 *
 * WHAT THE MOCKUP HAS THAT WE DELIBERATELY DO NOT
 * -----------------------------------------------
 *   - **"Keep me signed in".** It cannot be told the truth here.
 *     `AuthContext.tsx:117` pins `browserLocalPersistence` at module load
 *     specifically so "the login session never silently ends" is an
 *     explicit guarantee rather than an implicit default, and every
 *     sign-in call awaits that pin. A checkbox would either do nothing or
 *     have to revoke a guarantee the app makes on purpose. It also spares
 *     us porting `Checkbox`, whose own contract is wrong for this job: it
 *     strikes the label through when checked, because it is a completion
 *     control ("that is how a scanned list separates done from pending"),
 *     and `Checkbox.prompt.md` sends settings to `Switch`.
 *   - **"8 characters minimum."** The line is taken; the number is ours.
 *     `MIN_PASSWORD` below feeds the hint, the client check and the
 *     Firebase error copy from one place, so the screen can never state a
 *     rule it does not enforce — the class of bug UI-27 found on the
 *     deadlines screen. Raising it to the mockup's 8 is that constant.
 *   - **`size={17}` icons.** Icon.tsx's house rule is "sized in even steps
 *     (16 / 18 / 20 / 24)", so the documented rule wins over the sketch
 *     and these stay at 18.
 *   - **A `forgot` mode at all.** The mockup's "Forgot password?" is an
 *     `<a href="#reset">` that goes nowhere. Ours is a real third mode
 *     wired to `resetPassword`, and it keeps the "check your inbox" panel.
 *
 * Unchanged underneath: every call into `AuthContext`, the three modes and
 * how they reset each other, the Firebase error translation, the field
 * `name`/`autoComplete` pairing that password managers key off, and the
 * `m-auto` centring that lets a short viewport scroll instead of clipping.
 * This screen still has no nav and touches no store.
 *
 * `LoginAuraScene` stays. The mockup has no backdrop scene — the sheet
 * sits on bare `--focal` — but the rings are the app's own and Shreekant
 * kept them; see that file's header for what UI-28 changed there.
 *
 * This file no longer imports Framer Motion. That removes the second of
 * the two reasons `/login` is outside the screenshot harness (see the note
 * at scripts/screenshots.ts:131) — the `AnimatePresence mode="wait"`
 * heading swap that froze on the outgoing mode under a parked clock. The
 * first reason, `LoginAuraScene`'s permanent rAF loops, still stands, so
 * the screen stays out and stays verified against a real browser.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import LoginAuraScene from '../components/login/LoginAuraScene';
import { Button, GlassFilters, Icon, Input } from '../ui';
import type { IconName } from '../ui';

type Mode = 'signin' | 'signup' | 'forgot';

/**
 * Firebase's own floor is 6. The mockup's register hint reads "8 characters
 * minimum."; ours reads what it actually enforces. The hint, the client
 * check and the `weak-password` translation all spend this one constant, so
 * the screen cannot state a rule it does not apply.
 */
const MIN_PASSWORD = 6;

/** `Input size="lg"`. The reveal button is laid over the field, so it has
 *  to match that height itself rather than inherit it. */
const FIELD_H = 54;

/** readme.md, Motion: "Lists stagger at 44ms per item." */
const STAGGER_MS = 44;

/** `ag-condense` — the system's law for how anything arrives. */
const condense = (delayMs = 0): string =>
  `var(--kf-condense) var(--dur-base) var(--ease-glass) ${delayMs}ms both`;

function cleanFirebaseError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : fallback;
  const code = msg.match(/\(auth\/(.*?)\)/)?.[1];
  switch (code) {
    case 'email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'invalid-email':
      return 'That email address looks invalid.';
    case 'weak-password':
      return `Password should be at least ${MIN_PASSWORD} characters.`;
    case 'user-not-found':
    case 'invalid-credential':
    case 'wrong-password':
      return 'Incorrect email or password.';
    case 'too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return msg.replace('Firebase: ', '').replace(/ \(auth\/.*?\)\.?/, '');
  }
}

type FieldId = 'name' | 'email' | 'password' | 'confirm';

interface FieldSpec {
  id: FieldId;
  icon: IconName;
  type: 'text' | 'email' | 'password';
  placeholder: string;
  /** What the password manager keys off. Not the same as `id`. */
  name: string;
  autoComplete: string;
  required?: boolean;
}

/**
 * Copy per mode, as one table. The source keeps its two modes this way and
 * it is the right shape: the difference between them is data, which is
 * what makes the swap read as one pane resizing rather than a branch.
 */
const COPY: Record<Mode, { title: string; sub: string; cta: string; busy: string; ask: string; swap: string; to: Mode }> = {
  signin: {
    title: 'Welcome back',
    sub: 'Strict focus. One task at a time.',
    cta: 'Sign in',
    busy: 'Signing in',
    ask: 'Don’t have an account?',
    swap: 'Register',
    to: 'signup',
  },
  signup: {
    title: 'Create your account',
    sub: 'Register to start syncing your tasks.',
    cta: 'Create account',
    busy: 'Creating account',
    ask: 'Already have an account?',
    swap: 'Sign in',
    to: 'signin',
  },
  forgot: {
    title: 'Reset your password',
    sub: 'We will email you a reset link.',
    cta: 'Send reset link',
    busy: 'Sending',
    ask: 'Remembered it?',
    swap: 'Sign in',
    to: 'signin',
  },
};

/**
 * A bare text button. The mockup's two are an `<a>` and a `<button>` with
 * nothing but a colour transition — no fill, no rim — which is right: this
 * screen already spends its one loud control on the submit pill.
 *
 * The negative margin cancels the padding's effect on layout, so the hit
 * target is taller than the glyphs without the row growing around it.
 */
function TextButton({
  tone = 'accent',
  onClick,
  children,
}: {
  tone?: 'accent' | 'muted';
  onClick: () => void;
  children: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  const muted = tone === 'muted';

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        border: 0,
        background: 'transparent',
        padding: 'var(--sp-3) 0',
        margin: 'calc(var(--sp-3) * -1) 0',
        cursor: 'pointer',
        font: muted ? 'var(--type-caption)' : 'var(--type-label)',
        fontSize: muted ? undefined : 'var(--text-md)',
        color: muted
          ? hover
            ? 'var(--fg-2)'
            : 'var(--fg-3)'
          : hover
            ? 'var(--accent-lift)'
            : 'var(--accent)',
        transition: 'color var(--dur-fast) var(--ease-glass)',
      }}
    >
      {children}
    </button>
  );
}

export default function LoginPage() {
  const { signInWithEmail, signUpWithEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  /** Per field, as the source has it — `password` and `confirm` reveal
   *  independently, which is the only way to compare two you cannot see. */
  const [reveal, setReveal] = useState<Partial<Record<FieldId, boolean>>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState<number | null>(null);

  /*
   * The sheet animates to whatever the body measures. A ResizeObserver
   * rather than a `[mode]` effect because the height also changes when an
   * error arrives or the reset panel replaces the form, and the sheet is
   * `overflow: hidden` — a stale height clips real content away.
   *
   * No feedback loop: the observed element is the inner body, whose height
   * is its own content; the animated height is on its parent.
   *
   * `offsetHeight`, NOT `getBoundingClientRect().height` — measured, not
   * assumed. The rect carries every ancestor transform and the sheet's
   * entrance animation is one; see the header. `offsetHeight` is a layout
   * value and no transform can reach it.
   */
  const measure = useCallback(() => {
    const el = bodyRef.current;
    if (el) setBodyHeight(el.offsetHeight);
  }, []);

  /* Synchronous, before paint, for every change this component knows it
     made. A ResizeObserver alone would be enough in a tab you are looking
     at, but its callback is delivered in the rendering steps, and a hidden
     tab does not run them — so a mode switched off-screen would come back
     to a sheet still clipped to the height of the mode it left. */
  useLayoutEffect(measure, [measure, mode, error, resetSent]);

  /* And the observer for the changes it does not: a webfont landing late,
     a narrow window wrapping the footer onto two lines. */
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setResetSent(false);
    setReveal({});
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'forgot') {
      if (!email.trim()) {
        setError('Enter your email address first.');
        return;
      }
      setIsLoading(true);
      try {
        await resetPassword(email.trim());
        setResetSent(true);
      } catch (err) {
        setError(cleanFirebaseError(err, 'Could not send reset email. Please try again.'));
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (mode === 'signup' && password.length < MIN_PASSWORD) {
      setError(`Password should be at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email.trim(), password, name);
      } else {
        await signInWithEmail(email.trim(), password);
      }
    } catch (err) {
      setError(cleanFirebaseError(err, 'Something went wrong. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const copy = COPY[mode];

  const NAME_FIELD: FieldSpec = {
    id: 'name',
    icon: 'user',
    type: 'text',
    placeholder: 'Name (optional)',
    name: 'name',
    autoComplete: 'name',
  };
  const EMAIL_FIELD: FieldSpec = {
    id: 'email',
    icon: 'at-sign',
    type: 'email',
    placeholder: 'Email address',
    // `username`, not `email`: it is the token browsers and password
    // managers key off to pair this field with the password field below and
    // offer to save the credential pair for this specific account.
    name: 'username',
    autoComplete: 'username',
    required: true,
  };
  const pwComplete = mode === 'signup' ? 'new-password' : 'current-password';

  const fields: FieldSpec[] =
    mode === 'signup'
      ? [
          NAME_FIELD,
          EMAIL_FIELD,
          { id: 'password', icon: 'lock', type: 'password', placeholder: 'Password', name: 'password', autoComplete: pwComplete, required: true },
          { id: 'confirm', icon: 'lock', type: 'password', placeholder: 'Confirm password', name: 'confirm-password', autoComplete: 'new-password', required: true },
        ]
      : mode === 'forgot'
        ? [EMAIL_FIELD]
        : [
            EMAIL_FIELD,
            { id: 'password', icon: 'lock', type: 'password', placeholder: 'Password', name: 'password', autoComplete: pwComplete, required: true },
          ];

  const VALUE: Record<FieldId, [string, (v: string) => void]> = {
    name: [name, setName],
    email: [email, setEmail],
    password: [password, setPassword],
    confirm: [confirmPassword, setConfirmPassword],
  };

  /* Level 3, not level 2 — see the header. `-webkit-` stays on the plain
     blur: there is no SVG filter for Safari to resolve. */
  const sheet: CSSProperties = {
    margin: 'auto',
    width: '100%',
    maxWidth: 424,
    borderRadius: 'var(--r-sheet)',
    backgroundImage: 'var(--glass-fill-3)',
    backdropFilter: 'var(--glass-bd-lg-refract)',
    WebkitBackdropFilter: 'var(--glass-bd-lg)',
    boxShadow: 'var(--glass-shadow-thick)',
    overflow: 'hidden',
    animation: 'var(--kf-condense) var(--dur-slow) var(--ease-glass) both',
  };

  return (
    /*
     * The `isolation: isolate` this used to carry inline is now on `.ag-page`
     * itself, in `ui/tokens/backdrop.css` — UI-36 found that every other
     * screen needed it too. It is still load-bearing: without it `::before`
     * and `::after` (z-index -2 and -1) fall through to the root stacking
     * context and paint BEHIND this div's own opaque background, and the
     * pool and grain never appear. Do not drop it from the token.
     */
    <div className="ag-page ag-page--calm h-screen overflow-y-auto">
      {/* Animated glass aura — fixed + clipped, never affects page scroll/width */}
      <LoginAuraScene />

      {/* Real refraction for the sheet's `--glass-bd-lg-refract`. Without
          this in the document the whole backdrop-filter chain is invalid in
          Chromium and the sheet loses its blur outright. */}
      <GlassFilters />

      {/* `m-auto` on the sheet (not items-center/justify-center here) so that
          on short viewports it overflows into scroll instead of clipping
          off-screen. */}
      <div
        className="relative z-10 flex w-full min-h-full"
        style={{ padding: 'var(--sp-9) var(--gutter-page-sm)', boxSizing: 'border-box' }}
      >
        <main style={sheet}>
          {/* The morphing half: one pane growing between modes. */}
          <div
            style={{
              height: bodyHeight == null ? 'auto' : bodyHeight,
              overflow: 'hidden',
              transition: 'height var(--dur-morph) var(--ease-morph)',
            }}
          >
            <div ref={bodyRef} style={{ padding: 'var(--pad-sheet)' }}>
              {/* ── Identity ─────────────────────────────────────────── */}
              <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-5)' }}>
                <span style={{ position: 'relative', display: 'grid', placeItems: 'center', width: 56, height: 56 }}>
                  {/* `ag-ripple` — concentric rings leaving a live source.
                      The app starting is what emerald is rationed to mean. */}
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 'var(--r-circle)',
                      border: '1px solid var(--accent-hairline)',
                      animation: 'var(--kf-ripple) 3.2s var(--ease-in-out) infinite',
                    }}
                  />
                  <span
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      width: 56,
                      height: 56,
                      borderRadius: 'var(--r-tile)',
                      backgroundImage: 'var(--glass-fill-2)',
                      boxShadow: 'var(--glass-rim-2), var(--glow-accent-sm)',
                    }}
                  >
                    <img
                      src="/brand/mark-white.png"
                      alt=""
                      width={30}
                      height={30}
                      style={{ opacity: 0.95, display: 'block' }}
                    />
                  </span>
                </span>
                {/* The OS voice at its documented size — bold sans, 0.30em.
                    readme.md keeps it to one per screen; this is that one. */}
                <span
                  style={{
                    font: 'var(--type-system)',
                    letterSpacing: 'var(--tracking-system)',
                    textTransform: 'uppercase',
                    color: 'var(--accent)',
                  }}
                >
                  BASE
                </span>
              </div>

              {/* ── Heading — condenses in on every mode change ───────── */}
              <div
                key={`h-${mode}`}
                style={{
                  display: 'grid',
                  justifyItems: 'center',
                  gap: 'var(--sp-3)',
                  marginTop: 'var(--sp-7)',
                  animation: condense(),
                }}
              >
                <h1
                  style={{
                    font: 'var(--type-title)',
                    fontSize: 'var(--text-2xl)',
                    letterSpacing: 'var(--tracking-title)',
                    color: 'var(--fg-1)',
                  }}
                >
                  {copy.title}
                </h1>
                <p style={{ font: 'var(--type-body)', color: 'var(--fg-3)', textAlign: 'center' }}>{copy.sub}</p>
              </div>

              {mode === 'forgot' && resetSent ? (
                <div
                  style={{
                    display: 'grid',
                    justifyItems: 'center',
                    gap: 'var(--sp-6)',
                    marginTop: 'var(--sp-9)',
                    animation: condense(),
                  }}
                >
                  {/* --status-done, not the accent: emerald is rationed to mean
                      "live" and a sent email is finished, not running. */}
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      width: FIELD_H,
                      height: FIELD_H,
                      borderRadius: 'var(--r-circle)',
                      backgroundImage: 'var(--glass-fill-2)',
                      boxShadow: 'var(--glass-rim-2)',
                      color: 'var(--status-done)',
                    }}
                  >
                    <Icon name="circle-check" size={24} />
                  </span>
                  <p style={{ font: 'var(--type-body)', color: 'var(--fg-2)', textAlign: 'center' }}>
                    Password reset email sent to{' '}
                    <span style={{ color: 'var(--fg-1)', fontWeight: 'var(--weight-medium)' }}>{email}</span>. Check
                    your inbox.
                  </p>
                  <Button variant="ghost" onClick={() => switchMode('signin')}>
                    Back to sign in
                  </Button>
                </div>
              ) : (
                /* ── Fields — condense in on the 44ms list stagger ───── */
                <form
                  onSubmit={handleSubmit}
                  style={{ display: 'grid', gap: 'var(--sp-5)', marginTop: 'var(--sp-9)' }}
                >
                  {fields.map((f, i) => {
                    const [value, set] = VALUE[f.id];
                    const isPw = f.type === 'password';
                    const shown = !!reveal[f.id];

                    return (
                      <div
                        key={`${mode}-${f.id}`}
                        style={{ position: 'relative', animation: condense(i * STAGGER_MS) }}
                      >
                        <Input
                          size="lg"
                          id={`login-${f.id}`}
                          name={f.name}
                          type={isPw && !shown ? 'password' : isPw ? 'text' : f.type}
                          placeholder={f.placeholder}
                          autoComplete={f.autoComplete}
                          required={f.required}
                          minLength={isPw ? MIN_PASSWORD : undefined}
                          value={value}
                          onChange={(e) => set(e.target.value)}
                          iconLeft={<Icon name={f.icon} size={18} />}
                          /* Room for the reveal button. It is laid OVER the
                             field rather than dropped in `suffix`, because
                             `suffix` is contractually "a unit, not a word"
                             and renders in mono at --fg-4 — the wrong
                             envelope for a control, and it is the source's
                             own structure besides. */
                          style={isPw ? { paddingRight: 'calc(var(--hit-min) + var(--sp-3))' } : undefined}
                        />
                        {isPw && (
                          <button
                            type="button"
                            aria-label={shown ? 'Hide password' : 'Show password'}
                            onClick={() => setReveal((r) => ({ ...r, [f.id]: !r[f.id] }))}
                            style={{
                              position: 'absolute',
                              top: 0,
                              right: 'var(--sp-2)',
                              height: FIELD_H,
                              width: 'var(--hit-min)',
                              display: 'grid',
                              placeItems: 'center',
                              border: 0,
                              background: 'transparent',
                              cursor: 'pointer',
                              borderRadius: 'var(--r-circle)',
                              color: shown ? 'var(--accent)' : 'var(--fg-3)',
                              transition: 'color var(--dur-fast) var(--ease-glass)',
                            }}
                          >
                            <Icon name={shown ? 'eye-off' : 'eye'} size={18} />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* The row under the fields differs per mode. */}
                  {mode !== 'forgot' && (
                    <div
                      key={`r-${mode}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: mode === 'signin' ? 'flex-end' : 'space-between',
                        gap: 'var(--sp-4)',
                        minHeight: 24,
                        animation: condense(fields.length * STAGGER_MS),
                      }}
                    >
                      {mode === 'signin' ? (
                        <TextButton tone="muted" onClick={() => switchMode('forgot')}>
                          Forgot password?
                        </TextButton>
                      ) : (
                        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                          {MIN_PASSWORD} characters minimum.
                        </span>
                      )}
                    </div>
                  )}

                  {/* The one loud control on this screen. */}
                  <Button
                    type="submit"
                    variant="gel"
                    size="lg"
                    block
                    loading={isLoading}
                    style={{ marginTop: 'var(--sp-3)' }}
                  >
                    {isLoading ? copy.busy : copy.cta}
                  </Button>
                </form>
              )}

              {error && (
                <div
                  role="alert"
                  style={{
                    marginTop: 'var(--sp-6)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--sp-4)',
                    padding: 'var(--sp-4) var(--sp-5)',
                    borderRadius: 'var(--r-sm)',
                    backgroundImage: 'var(--glass-tint-rose)',
                    boxShadow: 'var(--glass-rim-2)',
                    animation: condense(),
                  }}
                >
                  <span style={{ display: 'flex', color: 'var(--status-overrun)', paddingTop: 1 }}>
                    <Icon name="circle-alert" size={18} />
                  </span>
                  <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>{error}</span>
                </div>
              )}

              {/* ── Footer — the morph trigger ────────────────────────── */}
              {/* Hidden once the reset mail is away: that panel already ends
                  in its own "Back to sign in", and the two sat a hairline
                  apart doing exactly the same thing. */}
              {!resetSent && (
                <div
                  style={{
                    marginTop: 'var(--sp-8)',
                    paddingTop: 'var(--sp-7)',
                    borderTop: '1px solid var(--line-soft)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 'var(--sp-3)',
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ font: 'var(--type-body)', color: 'var(--fg-3)' }}>{copy.ask}</span>
                  <TextButton onClick={() => switchMode(copy.to)}>{copy.swap}</TextButton>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
