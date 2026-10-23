/**
 * Catalog and Skills while their files are on the way (29-1P14d2, idea 116).
 *
 * Both screens are a list of files docked beside the one open, so both wait
 * in that shape: file rows on the left where the dock is, a pane with a
 * title and a paragraph where the open one goes. It replaces the "Reading the
 * laptop…" line they said before; what arrives fades in over it
 * (`useArrival`, in each screen).
 */
import { Bone, Skeleton, SkeletonRows } from '../ui';

export function MemoryWaiting({ docked, label }: { docked: boolean; label: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      style={{
        display: 'grid',
        gridTemplateColumns: docked ? '300px minmax(0,1fr)' : 'minmax(0,1fr)',
        gap: 'var(--sp-7)',
        alignItems: 'start',
      }}
    >
      {docked && (
        <div style={{ display: 'grid', gap: 'var(--sp-5)', paddingTop: 'var(--sp-4)' }}>
          <Bone height={36} radius="var(--r-md)" />
          <SkeletonRows rows={6} lead="square" sub trail={false} label={label} />
        </div>
      )}
      <div
        style={{
          display: 'grid', gap: 'var(--sp-7)', padding: 'var(--pad-card-lg)',
          borderRadius: 'var(--r-card-lg)',
          backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
        }}
      >
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <Bone width="22%" height={9} />
          <Bone width="46%" height={22} radius="var(--r-md)" />
        </div>
        <Skeleton aria-hidden="true" lines={5} height={11} lastLineWidth="48%" />
        <Skeleton aria-hidden="true" lines={3} height={11} lastLineWidth="30%" />
      </div>
    </div>
  );
}
