/* The `/` skills. Moved out of `pages/ChatPage.tsx` when it was
   split (BUILD-7). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSkills, type AtlasSkillHeader } from '../../lib/atlas/client';

export function useAtlasSkills(onAtlas: boolean, atlasBase: string | null) {
  /*
   * THE `/` SKILLS, AND WHY THIS ONE IS NOT REMEMBERED PER DEVICE.
   *
   * Mode and effort above are facts about this tablet and are written to
   * device storage. A summoned skill is a fact about *the conversation* — he
   * turned grilling on for this chat, not for this device — so it lives on the
   * laptop with the conversation and is read back from it below. Opening the
   * same chat on the tablet finds the skill still on, which is the whole point
   * of choosing "rest of the conversation" over "just this message".
   */
  const [skillList, setSkillList] = useState<AtlasSkillHeader[]>([]);
  const [activeSkill, setActiveSkill] = useState<string | null>(null);

  /*
   * The change waiting to be sent, or `undefined` for "nothing to say".
   *
   * A ref rather than state because nothing renders from it: the chip renders
   * from `activeSkill`, and this only has to survive until the next request
   * goes out. Cleared as the turn is issued, so a skill is announced once and
   * then carried by the conversation.
   */
  const pendingSkillRef = useRef<string | null | undefined>(undefined);

  const chooseSkill = useCallback((name: string | null) => {
    setActiveSkill(name);
    pendingSkillRef.current = name;
  }, []);

  /* Every skill on the laptop, for the `/` picker. Re-read when Atlas comes
     back, so a skill written on the Skills screen turns up in `/` without a
     reload — and emptied during render while it is away, so that until the
     re-read lands `/` offers nothing rather than a skill deleted meanwhile. */
  if ((!onAtlas || atlasBase === null) && skillList.length > 0) setSkillList([]);

  useEffect(() => {
    if (!onAtlas || atlasBase === null) return;
    const controller = new AbortController();
    void fetchSkills(atlasBase, controller.signal)
      .then((index) => setSkillList(index.skills))
      /* A laptop too old to have `/skills` leaves the list empty, which
         disables `/` rather than breaking the composer. */
      .catch(() => setSkillList([]));
    return () => controller.abort();
  }, [atlasBase, onAtlas]);

  return { skillList, activeSkill, setActiveSkill, pendingSkillRef, chooseSkill };
}
