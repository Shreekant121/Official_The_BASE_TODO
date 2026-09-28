/**
 * The AI panel, wired (BUILD-4).
 *
 * `ui/overlay/AIPanel` draws; `lib/aiPanelRun` talks to the model; this is
 * the one place the two meet, so each of the four surfaces — a task row, a
 * list header, the project masthead and `/scoring` — only says *what* the
 * panel is about and *where* it docks.
 *
 * The subject is rebuilt from the store on every render rather than handed
 * in, because the conversation itself can change it: ask the panel to move a
 * deadline and the header's meta line should say the new date. When the
 * object stops existing — deleted here, in another tab, or by Atlas — the
 * panel closes itself rather than naming something that is gone.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { resolveUserTimeZone } from '../lib/agent/dates';
import { buildSubject, subjectKey, type PanelSubjectRef, type ScoreField } from '../lib/aiPanel';
import {
  decide,
  ensureCatalogue,
  isRunning,
  selectSession,
  sendMessage,
  startScoring,
  stopTurn,
  undoTurn,
  usePanelStore,
  whoAnswers,
} from '../lib/aiPanelRun';
import { useAtlasStore } from '../lib/atlas/atlasStore';
import { useModelStore } from '../lib/agent/modelStore';
import { AIPanel, type AIPanelDock } from '../ui/overlay/AIPanel';
import ModelPicker from './ModelPicker';

interface AIPanelHostProps {
  subject: PanelSubjectRef;
  dock: AIPanelDock;
  onClose: () => void;
  /**
   * `/scoring` only: what the task on screen is still missing. Its presence is
   * what makes this the Score screen's panel — writes are held and read as
   * fills, and the panel opens by asking rather than by waiting.
   */
  scoreMissing?: ScoreField[];
}

export default function AIPanelHost({ subject: ref, dock, onClose, scoreMissing }: AIPanelHostProps) {
  const projects = useStore((s) => s.projects);
  const taskLists = useStore((s) => s.taskLists);
  const backlogTasks = useStore((s) => s.backlogTasks);
  const [timezone] = useState(resolveUserTimeZone);

  const { kind, id } = ref;
  const subject = useMemo(
    () => buildSubject({ kind, id }, { projects, taskLists, backlogTasks }, timezone),
    [kind, id, projects, taskLists, backlogTasks, timezone],
  );
  const key = subjectKey({ kind, id });
  const session = usePanelStore(selectSession(key));
  const fill = scoreMissing !== undefined;

  /* Re-rendered when either store moves, so "answered by" is current — and
     the laptop asked on open, because the panel may be the first thing in
     this session to need an answer from it. */
  useAtlasStore((s) => s.status);
  useModelStore((s) => s.selectedKey);
  useModelStore((s) => s.local);
  useModelStore((s) => s.loading);
  useEffect(() => {
    void ensureCatalogue();
  }, []);

  const gone = subject === null;
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);

  /* The Score screen's panel asks first — once per task, which
     `startScoring` enforces itself: a field filled mid-exchange re-runs this
     effect and must not restart the questions, and a panel reopened on a task
     that already has an exchange carries on from it. */
  useEffect(() => {
    if (!fill || !subject || isRunning(key)) return;
    startScoring(subject, scoreMissing ?? []);
  }, [fill, subject, key, scoreMissing]);

  const undoFor = useCallback((turn: string) => session.undos[turn], [session.undos]);

  if (!subject) return null;

  return (
    <AIPanel
      subject={subject}
      items={session.items}
      working={session.working}
      prompts={fill ? [] : subject.prompts}
      scope={subject.scope}
      answeredBy={whoAnswers() ?? undefined}
      placeholder={subject.placeholder}
      dock={dock}
      onClose={onClose}
      onSend={(text) => sendMessage(subject, text, { mode: fill ? 'fill' : 'auto', shown: true })}
      onStop={() => stopTurn(key)}
      undoFor={undoFor}
      onUndo={(turn) => void undoTurn(key, turn)}
      onDecide={(itemId, decision) => void decide(key, itemId, decision)}
      /* The chat screen's own picker, so there is one answer to "which model"
         on this device: a pick here is what `/chat` uses next, and the other
         way round. Each turn reads it when it starts, so a change applies from
         the next message — a turn already running finishes on its model. */
      footer={<ModelPicker />}
    />
  );
}
