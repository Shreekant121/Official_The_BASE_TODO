/**
 * Local | Cloud — the whole of choosing a model on Atlas's screens (OPT-8).
 *
 * His words: *"in settings allow me to select a default local Ai model and a
 * Default Cloud Ai model so instead of a model selector button, there can be 2
 * buttons side by side, local and cloud."* So which model each side means is
 * picked in Settings → Atlas (`components/AtlasSettingsSection.tsx`), and this
 * switch, on the composer's row and at the foot of the side panel, only flips
 * between the two. It is `SegmentedControl`'s soft look, the app's switch for
 * one of a few modes.
 *
 * **It shows what he chose, and says so when that is not what answers.** With
 * Local on and the laptop asleep there is no local model to run, and
 * `resolveChoice` answers on the cloud default — the fall-through a local pick
 * has always had. Lighting Cloud then would make his tap look ignored, so the
 * switch stays on Local and one short line beside it names who is answering.
 */
import { Icon, SegmentedControl } from '../../ui';
import { selectEffectiveModel, useModelStore } from '../../lib/agent/modelStore';
import { sideOf, type ModelSide } from '../../lib/agent/models';

const OPTIONS = [
  { value: 'local', label: 'Local', icon: <Icon name="laptop" size={14} /> },
  { value: 'cloud', label: 'Cloud', icon: <Icon name="globe" size={14} /> },
];

export function ModelSideSwitch() {
  const side = useModelStore((s) => s.choice.side);
  const chooseSide = useModelStore((s) => s.chooseSide);
  const model = useModelStore(selectEffectiveModel);
  const loading = useModelStore((s) => s.loading);
  const away = side === 'local' && sideOf(model.provider) === 'cloud' && !loading;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
      <SegmentedControl
        look="soft"
        size="sm"
        aria-label="Which model answers"
        title={model.label}
        options={OPTIONS}
        value={side}
        onChange={(next) => chooseSide(next as ModelSide)}
      />
      {away && (
        <span
          style={{
            font: 'var(--type-caption)', color: 'var(--fg-4)', minWidth: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          Laptop asleep · {model.label}
        </span>
      )}
    </span>
  );
}
