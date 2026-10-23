/**
 * Aurora Glass — the app's design system.
 *
 * Import from here, not from the individual files:
 *   import { Button, Tabs, Toast } from '../ui';
 *
 * The verbatim design project — including every component's `.prompt.md`,
 * the specimen cards and the screen mockups — is mirrored at `design-system/`
 * in the repo root. READ THE `.prompt.md` BEFORE REACHING FOR A COMPONENT;
 * several of them encode decisions that are meant not to be re-litigated
 * (Tabs vs SegmentedControl vs MiniNav, Toast vs NotificationCard, and why
 * destructive actions confirm inside MorphMenu rather than in a Dialog).
 *
 * Tokens are CSS, not TypeScript: they are imported once by src/index.css and
 * are then available everywhere as custom properties.
 */

export { GlassSurface } from './material/GlassSurface';
export type { GlassSurfaceProps, GlassLevel, GlassTint, GlassGlow } from './material/GlassSurface';
export { GlassFilters } from './material/GlassFilters';
export { CoverImage, PROJECT_COVER_RATIO } from './material/CoverImage';
export type { CoverImageProps } from './material/CoverImage';

/* V3 (V3-1): wrap a screen in <V3Scope> and it wears the v4 design. See core/V3.tsx. */
export { V3Scope } from './core/V3';
export { useV3, v3Attr } from './core/v3Context';
export type { V3ScopeProps } from './core/V3';
export { useMotion } from './core/motion';
export type { MotionTokens } from './core/motion';

export { Icon } from './core/Icon';
export type { IconProps, IconName } from './core/Icon';
export { LayeredIcon } from './core/LayeredIcon';
export type { LayeredIconProps } from './core/LayeredIcon';
/* 29-1P5c — motion: the gliding highlight, content that blurs across, icons that morph. */
export { useGlide } from './core/useGlide';
export { BlurAcross } from './core/BlurAcross';
export type { BlurAcrossProps } from './core/BlurAcross';
export { MorphIcon } from './core/MorphIcon';
export { KeyCaps } from './core/KeyCaps';
/* 29-1P6c — cards that lean toward the mouse. */
export { useTilt } from './core/useTilt';
export type { MorphIconKind, MorphIconProps } from './core/MorphIcon';

export { Button } from './actions/Button';
export type { ButtonProps, ButtonVariant, ButtonTone, ButtonSize } from './actions/Button';
export { IconButton } from './actions/IconButton';
export type { IconButtonProps, IconButtonSize, IconButtonTone, IconButtonVariant } from './actions/IconButton';
export { SegmentedControl } from './actions/SegmentedControl';
export type { SegmentedControlProps, SegmentedOption } from './actions/SegmentedControl';

/* 29-1P1 (BIG-15) — the design system: ten colours with one job each, and the
   thirteen buttons. Each file's header says when to use it; `/design` shows
   them all live. States are in `actions/buttons.css`. */
export { COLOUR_JOBS, COLOUR_JOB_INFO, askInk, gelVars } from './core/colourJobs';
export type { ColourJob } from './core/colourJobs';
export { DotArrow } from './core/DotArrow';
export { FocusGlide } from './core/FocusGlide';
export { GelButton } from './actions/GelButton';
export type { GelButtonProps } from './actions/GelButton';
export { SoftButton, SoftToggle, SoftIconButton, CountChip } from './actions/SoftButton';
export { WhiteButton } from './actions/WhiteButton';
export { FloatingAddButton } from './actions/FloatingAddButton';
export { SplitButton } from './actions/SplitButton';
export type { SplitButtonProps } from './actions/SplitButton';
export { HoldToConfirm } from './actions/HoldToConfirm';
export type { HoldToConfirmProps } from './actions/HoldToConfirm';
export { SlideToStart } from './actions/SlideToStart';
export type { SlideToStartProps } from './actions/SlideToStart';
export { DotArrowLink } from './actions/DotArrowLink';

export { Input } from './forms/Input';
export type { InputProps, InputSize } from './forms/Input';
export { Textarea } from './forms/Textarea';
export type { TextareaProps } from './forms/Textarea';
export { Switch } from './forms/Switch';
export type { SwitchProps } from './forms/Switch';
export { Checkbox } from './forms/Checkbox';
export type { CheckboxProps } from './forms/Checkbox';
export { TickBox } from './forms/TickBox';
export { popTick } from './forms/popTick';
export { Strike } from './forms/Strike';
export type { TickBoxProps } from './forms/TickBox';
export { Slider } from './forms/Slider';
export type { SliderProps, SliderTone } from './forms/Slider';
export { Knob } from './forms/Knob';
export type { KnobProps } from './forms/Knob';
export { MinuteRuler } from './forms/MinuteRuler';
export type { MinuteRulerProps } from './forms/MinuteRuler';

export { StatusPill } from './data/StatusPill';
export type { StatusPillProps, StatusName } from './data/StatusPill';
export { ScoreDial } from './data/ScoreDial';
export type { ScoreDialProps, ScoreDialSize } from './data/ScoreDial';
export { DatePage } from './data/DatePage';
export type { DatePageProps, DatePageSize } from './data/DatePage';
export { NewBestBadge, PerfectDayStamp } from './data/NewBest';
export type { NewBestBadgeProps, PerfectDayStampProps } from './data/NewBest';
export { BadgeFold } from './data/BadgeFold';
export type { BadgeFoldProps, BadgeFoldItem } from './data/BadgeFold';
export { StepTrack } from './data/StepTrack';
export { stepWash, withStepWash, STEP_WASH_TRANSITION, MAX_DOTS } from './data/stepWash';
export type { StepTrackProps } from './data/StepTrack';
export { PulseSquares } from './data/PulseSquares';
export type { PulseSquaresProps } from './data/PulseSquares';
export { SparkBars } from './data/SparkBars';
export type { SparkBarsProps, SparkTone } from './data/SparkBars';
export { RollingNumber } from './data/RollingNumber';
export type { RollingNumberProps } from './data/RollingNumber';
export { bumpBadge, usePopOnLateMount } from './data/rollCount';
export { Countdown } from './data/Countdown';
export type { CountdownProps, CountdownTone, CountdownSize, CountdownFormat } from './data/Countdown';
export { TaskRow } from './data/TaskRow';
export type { TaskRowProps } from './data/TaskRow';
export { AskCard, AskReceipt } from './data/AskCard';
export type { AskCardProps } from './data/AskCard';
/* V3-8: Atlas's WebGL presence orb, with its own CSS fallback. */
export { AiPresence } from './data/AiPresence';
export type { AiPresenceProps, AiPresenceState } from './data/AiPresence';
/* 29-1P1, idea 65: big numbers in their job's colour. */
export { GradientNumber } from './data/GradientNumber';
export type { GradientNumberProps, NumberTone } from './data/GradientNumber';

export { Toast } from './feedback/Toast';
export type { ToastProps, ToastTone } from './feedback/Toast';
export { NotificationCard } from './feedback/NotificationCard';
export type { NotificationCardProps, NotificationTone } from './feedback/NotificationCard';
/* 29-1P14d1 (idea 26): the notices at the top, piled. */
export { NoticeStack } from './feedback/NoticeStack';
export type { NoticeStackProps } from './feedback/NoticeStack';
export { Skeleton, Bone, SkeletonRows } from './feedback/Skeleton';
export { useArrival } from './feedback/useArrival';
export { WarnLine } from './feedback/WarnLine';
export type { WarnLineProps } from './feedback/WarnLine';
export type { SkeletonProps, BoneProps, SkeletonRowsProps } from './feedback/Skeleton';
export { TravellingTrack } from './feedback/TravellingTrack';
export type { TravellingTrackProps } from './feedback/TravellingTrack';
export { Waveform } from './feedback/Waveform';
export type { WaveformProps, WaveformTone } from './feedback/Waveform';
/* 29-1P14c — sentences that light their key words (87), and empty, but calm (113). */
export { LitLine, Lit } from './feedback/LitLine';
export type { LitLineProps } from './feedback/LitLine';
export { litParts, litSafe, litPlain } from './feedback/litParts';
export { EmptyCalm, EmptyDrawing } from './feedback/EmptyCalm';
export { EdgeLight } from './feedback/EdgeLight';
export { useWordReveal } from './feedback/useWordReveal';
export type { EdgeLightProps } from './feedback/EdgeLight';
export { Horizon, AskGlow, Remembered } from './feedback/AtlasAtRest';
export type { HorizonProps, AskGlowProps, RememberedProps } from './feedback/AtlasAtRest';
/* 29-1P15d — colours moving inside the glass while Atlas works long (77). */
export { DriftGlass, LongJobSeconds } from './feedback/DriftGlass';
export { useLongJob, LONG_JOB_MS } from './feedback/useLongJob';
export type { LongJob } from './feedback/useLongJob';
export type { EmptyCalmProps, EmptyArt } from './feedback/EmptyCalm';

export { Dialog } from './overlay/Dialog';
export type { DialogProps } from './overlay/Dialog';
export { CommandPalette } from './overlay/CommandPalette';
export type { CommandPaletteProps, CommandPaletteItem } from './overlay/CommandPalette';
export { MorphMenu } from './overlay/MorphMenu';
export type { MorphMenuProps, MorphMenuItem, MorphMenuHeaderObject } from './overlay/MorphMenu';

export { MiniNav } from './navigation/MiniNav';
export type { MiniNavProps, MiniNavItem } from './navigation/MiniNav';
export { Stepper } from './navigation/Stepper';
export type { StepperProps, Step } from './navigation/Stepper';
export { Tabs } from './navigation/Tabs';
export type { TabsProps, Tab } from './navigation/Tabs';

/* Page composition — not design-project components, but defined inline by
   every one of its screen mockups. See layout/panels.tsx. */
export { Card, Well, Kicker, MetaKicker, FieldLabel, Chip } from './layout/panels';
export type { CardProps, WellProps, KickerProps, MetaKickerProps, FieldLabelProps, ChipProps } from './layout/panels';

export { TaskSheet } from './layout/TaskSheet';
export type { TaskSheetProps } from './layout/TaskSheet';

export { useMedia, WIDE } from './useMedia';
