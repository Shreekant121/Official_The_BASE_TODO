/**
 * Aurora Glass — Icon
 * Ported from design-system/components/core/Icon.{jsx,d.ts}.
 * Guidance: design-system/components/core/Icon.prompt.md
 *
 * House settings: 1.5 stroke, round caps, sized in even steps
 * (16 / 18 / 20 / 24). Never fill a Lucide glyph.
 *
 * REWRITTEN, NOT COPIED — and this is the one component that had to be.
 * ---------------------------------------------------------------------
 * The design project's version reaches for `window.lucide`, the UMD
 * global its specimen cards load from a CDN, and drives it with
 * `dangerouslySetInnerHTML` plus a `createIcons()` sweep on every
 * render. None of that exists in this app, which ships `lucide-react`
 * as a real dependency, so a verbatim port would render empty spans.
 *
 * Why a registry rather than `import * as Lucide from 'lucide-react'`:
 * the namespace import defeats tree-shaking and drags all ~2000 glyphs
 * into the bundle. Why not lucide-react's own `DynamicIcon`: it is not
 * exported from the package root in v1.22, and it resolves the glyph in
 * an effect — chrome icons would pop in a frame late on every mount.
 *
 * So the map below is explicit. It is seeded with every glyph the app
 * already imports plus every one the Aurora Glass screen mockups name,
 * which means a mockup's `<Icon name="..." />` can be pasted into a
 * screen as-is. ADDING A GLYPH IS ONE LINE — import it, add the
 * kebab-case key. An unknown name renders nothing and warns in dev.
 *
 * Application code that already does `import { Clock } from
 * 'lucide-react'` should stay as it is. Per the design system's own
 * readme, this wrapper is for string-addressed use; a direct import is
 * the better call when the glyph is known at the call site.
 *
 * V3 REVERSES THAT LAST PARAGRAPH (V3-1). Inside a `<V3Scope>` this
 * component draws Phosphor's solid glyph for the same name, so a screen
 * moving to V3 should route its direct `lucide-react` imports through
 * here — a direct import is the one icon a scope cannot reach. Adding a
 * glyph is now two steps: the line here, then `npm run build:icons`,
 * which writes its Phosphor twin into `phosphor.generated.ts`.
 */
import type { CSSProperties, HTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity, AlarmClock, AlignLeft, Archive, ArchiveRestore, ArrowDown, ArrowDownLeft, ArrowDownRight, ArrowDownUp, ArrowDownWideNarrow, ArrowLeft, ArrowRight,
  ArrowUp, ArrowUpLeft, ArrowUpRight,
  AtSign, Award, BadgeCheck, BarChart3, BatteryCharging, BatteryLow, Bell, BellOff, BellRing, BookOpen, Brain, Calculator, Calendar,
  CalendarClock, CalendarPlus, CalendarX, Check, CheckCheck, CheckCircle2, CheckSquare,
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Circle, CircleAlert, CircleCheck,
  CircleDot, Clock, CloudOff, Columns3, Copy, CornerDownLeft, CornerDownRight, CornerUpLeft, Cpu, Database,
  Edit2, Ellipsis, Eraser, ExternalLink, Eye, EyeOff, FileText, Filter, Flame, FlagTriangleRight,
  Folder, FolderKanban, FolderOpen, FolderPlus, GitBranch, Globe, Grid2x2, GripVertical, Hand, HardDrive,
  Home, Hourglass, House, Inbox, Info, Mic, MicOff,
  Image, ImageUp, IndianRupee, KeyRound, Keyboard, Laptop, Layers, Library, LayoutDashboard, Link, Link2, List, ListChecks,
  ListTree, Loader, Loader2, Lock, LogOut, Mail, MessageSquarePlus, Minus, Moon, MoreHorizontal, Move, Palette, PanelLeft, Pause, Pencil,
  PanelRightOpen, Pin, Pipette, Play, Plus, PlusCircle, Power, QrCode, RefreshCw, Repeat, RotateCcw,
  RotateCw, Scaling, Scissors, ScrollText, Search, Send, Server, Settings, Settings2, Share2, ShieldAlert, ShieldCheck, Sigma, SkipForward,
  Sliders, SlidersHorizontal, Smartphone, SearchX,
  Sparkles, Square, SquareCheckBig, SquarePen, Star, Stethoscope, Tablet, Tag, Target, Text,
  Timer, Trash2, TriangleAlert, Undo2, Unlink, User, UserCircle, Users, Volume2, VolumeX, WifiOff, Wind, Wrench, X, XCircle, Zap,
} from 'lucide-react';
import { PHOSPHOR } from './phosphor.generated';
import { useV3 } from './v3Context';

/**
 * kebab-case name → Lucide component. Keys match Lucide's own icon
 * slugs, which is what the design-system mockups use.
 */
const REGISTRY = {
  'alarm-clock': AlarmClock,
  'archive': Archive,
  'archive-restore': ArchiveRestore,
  'activity': Activity,
  'align-left': AlignLeft,
  'arrow-down': ArrowDown,
  'arrow-down-left': ArrowDownLeft,
  'arrow-down-right': ArrowDownRight,
  'arrow-down-up': ArrowDownUp,
  'arrow-down-wide-narrow': ArrowDownWideNarrow,
  'arrow-left': ArrowLeft,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUp,
  'arrow-up-left': ArrowUpLeft,
  'arrow-up-right': ArrowUpRight,
  'at-sign': AtSign,
  'award': Award,
  'badge-check': BadgeCheck,
  'bar-chart-3': BarChart3,
  /* DESIGN-2. The Doze note's "How to exempt Brave". */
  'battery-charging': BatteryCharging,
  /* Item 13A. `atlas.html`'s battery pill names this glyph exactly. */
  'battery-low': BatteryLow,
  'bell': Bell,
  'bell-off': BellOff,
  'bell-ring': BellRing,
  'book-open': BookOpen,
  /* Item 12. `atlas.html` marks a kept thought with this and nothing else in
     the app reaches for it, which is why it arrives now rather than earlier. */
  'brain': Brain,
  'calculator': Calculator,
  'calendar': Calendar,
  'calendar-clock': CalendarClock,
  'calendar-plus': CalendarPlus,
  'calendar-x': CalendarX,
  'check': Check,
  'check-check': CheckCheck,
  'check-circle-2': CheckCircle2,
  'check-square': CheckSquare,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'circle': Circle,
  'circle-alert': CircleAlert,
  'circle-check': CircleCheck,
  'circle-dot': CircleDot,
  'clock': Clock,
  'cloud-off': CloudOff,
  'columns-3': Columns3,
  'copy': Copy,
  'corner-down-left': CornerDownLeft,
  'corner-down-right': CornerDownRight,
  'corner-up-left': CornerUpLeft,
  'cpu': Cpu,
  'database': Database,
  'edit-2': Edit2,
  'ellipsis': Ellipsis,
  'eraser': Eraser,
  'external-link': ExternalLink,
  'eye': Eye,
  'eye-off': EyeOff,
  'file-text': FileText,
  'filter': Filter,
  'flame': Flame,
  'flag-triangle-right': FlagTriangleRight,
  'folder': Folder,
  'folder-kanban': FolderKanban,
  'folder-open': FolderOpen,
  'folder-plus': FolderPlus,
  'git-branch': GitBranch,
  'globe': Globe,
  'grid-2x2': Grid2x2,
  'grip-vertical': GripVertical,
  'hand': Hand,
  'hard-drive': HardDrive,
  'home': Home,
  'hourglass': Hourglass,
  'house': House,
  'image': Image,
  'inbox': Inbox,
  'info': Info,
  'image-up': ImageUp,
  'indian-rupee': IndianRupee,
  'key-round': KeyRound,
  'keyboard': Keyboard,
  'laptop': Laptop,
  'layers': Layers,
  'library': Library,
  'layout-dashboard': LayoutDashboard,
  'link': Link,
  'link-2': Link2,
  'list': List,
  'list-checks': ListChecks,
  'list-tree': ListTree,
  'loader': Loader,
  'loader-2': Loader2,
  'lock': Lock,
  'log-out': LogOut,
  'mail': Mail,
  'message-square-plus': MessageSquarePlus,
  'mic': Mic,
  'mic-off': MicOff,
  'minus': Minus,
  'moon': Moon,
  'more-horizontal': MoreHorizontal,
  'move': Move,
  'palette': Palette,
  'panel-right-open': PanelRightOpen,
  'panel-left': PanelLeft,
  'pause': Pause,
  'pencil': Pencil,
  'pin': Pin,
  'pipette': Pipette,
  'play': Play,
  'plus': Plus,
  'plus-circle': PlusCircle,
  'power': Power,
  'qr-code': QrCode,
  'refresh-cw': RefreshCw,
  'repeat': Repeat,
  'rotate-ccw': RotateCcw,
  'rotate-cw': RotateCw,
  'scaling': Scaling,
  'scissors': Scissors,
  'scroll-text': ScrollText,
  'search': Search,
  'search-x': SearchX,
  'send': Send,
  'server': Server,
  'settings': Settings,
  'settings-2': Settings2,
  'share-2': Share2,
  'shield-alert': ShieldAlert,
  'shield-check': ShieldCheck,
  'sigma': Sigma,
  'skip-forward': SkipForward,
  'sliders': Sliders,
  'sliders-horizontal': SlidersHorizontal,
  'smartphone': Smartphone,
  'sparkles': Sparkles,
  'square': Square,
  'square-check-big': SquareCheckBig,
  'square-pen': SquarePen,
  'star': Star,
  'stethoscope': Stethoscope,
  'tablet': Tablet,
  'tag': Tag,
  'target': Target,
  'text': Text,
  'timer': Timer,
  'trash-2': Trash2,
  'triangle-alert': TriangleAlert,
  'undo-2': Undo2,
  'unlink': Unlink,
  'user': User,
  'user-circle': UserCircle,
  'users': Users,
  'volume-2': Volume2,
  'volume-x': VolumeX,
  'wifi-off': WifiOff,
  'wind': Wind,
  'wrench': Wrench,
  'x': X,
  'x-circle': XCircle,
  'zap': Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof REGISTRY;

export interface IconProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Lucide icon name in kebab-case, e.g. `clock`, `circle-check`, `list-checks`. */
  name: IconName;
  /** Box size in px. Stick to 16 / 18 / 20 / 24. */
  size?: number;
  /** Stroke width. The house value is 1.5 — do not go below 1.25 or above 2. */
  stroke?: number;
}

export function Icon({ name, size = 18, stroke = 1.5, className = '', style, ...rest }: IconProps) {
  const v3 = useV3();
  const Glyph: LucideIcon | undefined = REGISTRY[name];

  if (!Glyph) {
    if (import.meta.env.DEV) {
      console.warn(
        `[Icon] "${name}" is not in the registry (src/ui/core/Icon.tsx). ` +
          'Import it from lucide-react, add the kebab-case key, then run npm run build:icons.',
      );
    }
    return null;
  }

  const box: CSSProperties = {
    display: 'inline-flex',
    flex: '0 0 auto',
    width: size,
    height: size,
    ...style,
  };

  /*
   * V3 draws Phosphor, solid (V3-1). Same name, other set: the name is the
   * Lucide one and `phosphor.generated.ts` holds its twin in one weight. The
   * glyph is drawn 12% larger than its box and centred on it, with a soft
   * drop shadow, because that is what `Icon.jsx` does — Phosphor's glyphs sit
   * inside more padding than Lucide's, and a solid white shape needs the
   * shadow to lift off clear glass. `stroke` means nothing to a filled glyph.
   * A name with no twin keeps its Lucide glyph, as the design's own does.
   */
  const paths = v3 ? PHOSPHOR[name] : undefined;
  if (paths) {
    const glyph = Math.round(size * 1.12);
    return (
      <span aria-hidden="true" className={className} style={{ ...box, alignItems: 'center', justifyContent: 'center' }} {...rest}>
        <svg
          viewBox="0 0 256 256"
          width={glyph}
          height={glyph}
          fill="currentColor"
          style={{ display: 'block', flex: '0 0 auto', filter: 'drop-shadow(0 1px 3px oklch(0 0 0 / 0.35))' }}
        >
          {paths.map((d, i) => <path key={i} d={d} />)}
        </svg>
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={className} style={box} {...rest}>
      <Glyph size={size} strokeWidth={stroke} style={{ width: '100%', height: '100%', display: 'block' }} />
    </span>
  );
}
