import React from 'react';

/* Icon — Phosphor, filled by default (solid white glyphs pop off glass).
   Names are the Lucide names the system already used; they map to the
   Phosphor equivalent. Unmapped names fall back to Lucide, so nothing
   goes blank. weight: "fill" (default) | "bold" (small UI marks: x,
   check, chevrons, plus, arrows). Phosphor CSS loads via tokens/fonts.css. */
const MAP = {"square-pen":"note-pencil","pencil":"pencil-simple","pen":"pen","chevron-right":"caret-right","chevron-left":"caret-left","chevron-down":"caret-down","chevron-up":"caret-up","share-2":"share-network","share":"export","ellipsis":"dots-three","ellipsis-vertical":"dots-three-vertical","more-horizontal":"dots-three","plus":"plus","minus":"minus","x":"x","check":"check","check-check":"checks","corner-down-right":"arrow-elbow-down-right","zap":"lightning","list-checks":"list-checks","list":"list","list-todo":"list-checks","git-branch":"git-branch","triangle-alert":"warning","alert-triangle":"warning","circle-alert":"warning-circle","info":"info","keyboard":"keyboard","arrow-right":"arrow-right","arrow-left":"arrow-left","arrow-up":"arrow-up","arrow-down":"arrow-down","arrow-up-right":"arrow-up-right","layout-dashboard":"squares-four","layout-grid":"squares-four","layers":"stack","image-up":"image","image":"image","search":"magnifying-glass","user":"user","users":"users","user-plus":"user-plus","refresh-cw":"arrows-clockwise","rotate-ccw":"arrow-counter-clockwise","undo-2":"arrow-u-up-left","log-out":"sign-out","log-in":"sign-in","power":"power","archive":"archive","trash":"trash","trash-2":"trash","clock":"clock","timer":"timer","hourglass":"hourglass","calendar":"calendar-blank","calendar-clock":"calendar-dots","calendar-days":"calendar-dots","bell":"bell","bell-ring":"bell-ringing","bell-off":"bell-slash","settings":"gear-six","settings-2":"sliders-horizontal","sliders-horizontal":"sliders-horizontal","mic":"microphone","mic-off":"microphone-slash","play":"play","pause":"pause","square":"stop","stop-circle":"stop-circle","sparkles":"sparkle","sparkle":"sparkle","bot":"robot","send":"paper-plane-tilt","paperclip":"paperclip","link":"link","link-2":"link","copy":"copy","mail":"envelope-simple","inbox":"tray","star":"star","heart":"heart","flag":"flag","tag":"tag","target":"target","flame":"fire","gauge":"gauge","chart-bar":"chart-bar","bar-chart-3":"chart-bar","trending-up":"trend-up","trending-down":"trend-down","folder":"folder","folder-open":"folder-open","file":"file","file-text":"file-text","lock":"lock","unlock":"lock-open","shield":"shield","shield-check":"shield-check","eye":"eye","eye-off":"eye-slash","filter":"funnel","sort":"sort-ascending","grip-vertical":"dots-six-vertical","move":"arrows-out-cardinal","maximize-2":"arrows-out","minimize-2":"arrows-in","external-link":"arrow-square-out","download":"download-simple","upload":"upload-simple","cloud":"cloud","wifi":"wifi-high","globe":"globe","phone":"phone","message-square":"chat-circle","message-circle":"chat-circle","home":"house","house":"house","book-open":"book-open","brain":"brain","cpu":"cpu","server":"hard-drives","database":"database","key":"key","contact":"address-book","puzzle":"puzzle-piece","volume-2":"speaker-high","volume-x":"speaker-x","circle":"circle","circle-check":"check-circle","check-circle":"check-circle","circle-x":"x-circle","circle-dot":"record","history":"clock-counter-clockwise","scroll-text":"scroll","fingerprint":"fingerprint","at-sign":"at","hash":"hash","moon":"moon","sun":"sun","wand-2":"magic-wand","command":"command","menu":"list","panel-left":"sidebar","columns-3":"columns","table":"table","kanban":"kanban","repeat":"repeat","shuffle":"shuffle","skip-forward":"skip-forward","ban":"prohibit","eraser":"eraser","notebook":"notebook","map-pin":"map-pin","reply":"arrow-bend-up-left","forward":"arrow-bend-up-right","dollar-sign":"currency-dollar","credit-card":"credit-card","smartphone":"device-mobile","monitor":"monitor","laptop":"laptop","tablet":"device-tablet"};
const BOLD = { x: 1, check: 1, plus: 1, minus: 1, 'chevron-right': 1, 'chevron-left': 1, 'chevron-down': 1, 'chevron-up': 1, 'arrow-right': 1, 'arrow-left': 1, 'arrow-up': 1, 'arrow-down': 1, 'arrow-up-right': 1, 'corner-down-right': 1, ellipsis: 1, search: 1, 'external-link': 1 };

export function Icon({ name, size = 18, weight, stroke = 1.5, className = '', style, ...rest }) {
  const ph = MAP[name];
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ph || !window.lucide || !ref.current) return;
    window.lucide.createIcons();
    const svg = ref.current.querySelector('svg');
    if (svg) { svg.setAttribute('stroke-width', 2); svg.style.width = '100%'; svg.style.height = '100%'; svg.style.display = 'block'; }
  }, [name, ph]);
  const box = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', width: size, height: size, ...style };
  if (ph) {
    const w = weight || (BOLD[name] ? 'bold' : 'fill');
    return (
      <span aria-hidden="true" className={className} style={box} {...rest}>
        <i className={'ph-' + w + ' ph-' + ph} style={{ fontSize: Math.round(size * 1.12), lineHeight: 1, filter: 'drop-shadow(0 1px 3px oklch(0 0 0 / 0.35))' }} />
      </span>
    );
  }
  return <span ref={ref} aria-hidden="true" className={className} style={box} dangerouslySetInnerHTML={{ __html: '<i data-lucide="' + name + '"></i>' }} {...rest} />;
}
