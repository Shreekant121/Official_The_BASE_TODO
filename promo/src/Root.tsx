import React from 'react';
import { Composition } from 'remotion';
import '@fontsource-variable/inter';
import { Promo, PROMO_SECONDS } from './Promo';

export const FPS = 60;

export const Root: React.FC = () => (
  <>
    {/* The real thing: 1080p at 60fps. */}
    <Composition id="BasePromo" component={Promo} durationInFrames={PROMO_SECONDS * FPS} fps={FPS} width={1920} height={1080} />
    {/* Same video at 30fps, for quick drafts. Scenes are timed in seconds, so both stay in sync. */}
    <Composition id="BasePromoDraft" component={Promo} durationInFrames={PROMO_SECONDS * 30} fps={30} width={1920} height={1080} />
  </>
);
