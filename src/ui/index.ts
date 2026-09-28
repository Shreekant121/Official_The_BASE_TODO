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
export { GlassLens } from './material/GlassLens';
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

export { Button } from './actions/Button';
export type { ButtonProps, ButtonVariant, ButtonTone, ButtonSize } from './actions/Button';
export { IconButton } from './actions/IconButton';
export type { IconButtonProps, IconButtonSize, IconButtonTone, IconButtonVariant } from './actions/IconButton';
export { SegmentedControl } from './actions/SegmentedControl';
export type { SegmentedControlProps, SegmentedOption } from './actions/SegmentedControl';

export { Input } from './forms/Input';
export type { InputProps, InputSize } from './forms/Input';
export { Textarea } from './forms/Textarea';
export type { TextareaProps } from './forms/Textarea';
export { Switch } from './forms/Switch';
export type { SwitchProps } from './forms/Switch';
export { Checkbox } from './forms/Checkbox';
export type { CheckboxProps } from './forms/Checkbox';
export { Slider } from './forms/Slider';
export type { SliderProps, SliderTone } from './forms/Slider';

export { StatusPill } from './data/StatusPill';
export type { StatusPillProps, StatusName } from './data/StatusPill';
export { ProgressRing } from './data/ProgressRing';
export type { ProgressRingProps, RingTone } from './data/ProgressRing';
export { ScoreDial } from './data/ScoreDial';
export type { ScoreDialProps, ScoreDialSize } from './data/ScoreDial';
export { SparkBars } from './data/SparkBars';
export type { SparkBarsProps, SparkTone } from './data/SparkBars';
export { Countdown } from './data/Countdown';
export type { CountdownProps, CountdownTone, CountdownSize, CountdownFormat } from './data/Countdown';
export { TaskRow } from './data/TaskRow';
export type { TaskRowProps } from './data/TaskRow';
export { AskCard, AskReceipt } from './data/AskCard';
export type { AskCardProps } from './data/AskCard';
/* V3-8: Atlas's WebGL presence orb, with its own CSS fallback. */
export { AiPresence } from './data/AiPresence';
export type { AiPresenceProps, AiPresenceState } from './data/AiPresence';

export { Toast } from './feedback/Toast';
export type { ToastProps, ToastTone } from './feedback/Toast';
export { NotificationCard } from './feedback/NotificationCard';
export type { NotificationCardProps, NotificationTone } from './feedback/NotificationCard';
export { Skeleton } from './feedback/Skeleton';
export type { SkeletonProps } from './feedback/Skeleton';
export { TravellingTrack } from './feedback/TravellingTrack';
export type { TravellingTrackProps } from './feedback/TravellingTrack';
export { Waveform } from './feedback/Waveform';
export type { WaveformProps, WaveformTone } from './feedback/Waveform';

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
