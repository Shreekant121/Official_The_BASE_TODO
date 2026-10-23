/* Moved out of `pages/ChatPage.tsx`, unchanged, when it was split (BUILD-7). */
import type { AtlasStatus } from '../../lib/atlas/atlasStore';

/**
 * The subtitle under "Assistant", which is now the answer to "who am I talking
 * to?" (item 8).
 *
 * There are two assistants behind this screen and they can do different
 * things, so one fixed line describing "the assistant" cannot be true of both.
 * It used to read *"Types into your real backlog. Every turn can be reverted"*
 * — which is exactly right for the in-browser agent and exactly wrong for
 * Atlas, which cannot touch a task until item 9.
 *
 * **The asleep sentence is `DESIGN.md` §9's own, kept word for word.** It is
 * the one piece of copy that item 8 specifies, and it is written the way it is
 * because a closed lid is an ordinary Tuesday, not a fault: it says what
 * happened, names what he is using instead, and asks for nothing. `--status-warn`
 * rather than an error colour for the same reason.
 *
 * `unconfigured` deliberately reads as the old line rather than mentioning
 * Atlas at all. A deployment with no laptop configured has none to be asleep,
 * and naming one would send somebody looking for a machine that was never set
 * up.
 *
 * **ITEM 9B TOOK THE DIAGNOSIS OUT OF ALL THREE OF THESE.** This line, the
 * composer's footnote and `EmptyState`'s sentence were each carrying their own
 * version of "it cannot reach your tasks", and this one added *"Check Atlas's
 * setup"* with nowhere to check it. `/atlas-host` is that place now: it reads
 * `mcp.failed[].reason` off `/health` and names the missing key. So each of the
 * three keeps only its own job — this one says who is answering, the footnote
 * says what this app does with what they write, and the empty state says what
 * they can be asked for.
 *
 * **There is deliberately no link to `/atlas-host` in this line, and that was
 * tried.** A trailing "The host" wraps the sentence onto two lines at 820
 * wide, which makes the header taller and pushes the whole transcript down —
 * the same regression the note above records being removed once already, and
 * worth 16,918 moved cells in the tablet baseline for one word. `/atlas-host`
 * is a visible destination in the nav on every screen since item 9B, including
 * this one's own rail, so it is already one press away. If a link ever does
 * belong here, it goes in the control row on the right, not in this sentence.
 */
/*
 * Since BIG-12 (27A-5) there is one assistant, Atlas, answering from the laptop
 * or from this page. The notes above describe the two-assistant years and are
 * kept for why the sentences are short.
 */
export function whoIsAnswering(
  onAtlas: boolean,
  atlasStatus: AtlasStatus,
  atlasHasTools: boolean,
  /**
   * Whether a turn is running right now (item 13G).
   *
   * `atlas.html`'s header line is two words — **"Working"** while it is, and
   * **"Awake on the laptop"** while it is not — and this function had one
   * standing sentence for both. The mockup is right about the working half:
   * the dot beside it is already emitting, and a live dot over a sentence that
   * never changes says the sentence is not about the dot.
   *
   * The mockup is not right about the rest, because it only draws one machine.
   * Every warning branch below is a state it has no way to be in — an Atlas
   * with no hands, a sleeping laptop, a browser fallback — and each of those
   * sentences names something Shreekant would otherwise have to guess. So the
   * mockup's two words are taken for the two states it actually describes, and
   * the warnings keep their own words.
   */
  working: boolean,
  /** BIG-12: Atlas is running in this page — the laptop is shut, or cannot take this pick. */
  onTablet = false,
  /** Whether an account is signed in; Atlas in this page needs one. */
  signedIn = true,
): { text: string; warn: boolean } {
  /* BIG-12. Not a warning: this is all of Atlas, on this device. The one thing
     it lacks away from the laptop is the laptop's own model. Kept short for the
     reason the sentences below are — a second line pushes the header taller. */
  if (onTablet) return { text: working ? 'Working' : 'Atlas, running here', warn: false };
  if (onAtlas) {
    /*
     * ITEM 9: THIS IS READ FROM ATLAS, NOT ASSUMED
     * ----------------------------------------------
     * Item 8 said this line "reverts at item 9", and reverting it outright
     * would have been wrong. Atlas has hands only when its MCP server actually
     * connected, and that server needs a Firebase service-account key on the
     * laptop — so "Atlas is up" and "Atlas can change tasks" are two different
     * facts and the second is the one this sentence is about. `/health` now
     * carries it as `stage.tools`, which is exactly why item 9 put it there.
     *
     * The no-tools line is deliberately no longer worded as a stage of
     * construction ("yet"). It is now a setup problem with a fix, and the
     * Settings page is where the reason from `/health` is shown.
     */
    if (!atlasHasTools) {
      return {
        text: 'Atlas, on your laptop. It can talk this through — it cannot reach your tasks.',
        warn: true,
      };
    }
    // No Revert clause on this path, and that is not an oversight: the
    // snapshot ring is a Zustand store in this browser, and an Atlas turn does
    // not touch it. What replaces it is the action log (DESIGN.md §5.3), which
    // is item 13. Until then a deletion is undone from the Trash and an edit
    // by asking for it back.
    return { text: working ? 'Working' : 'Awake on the laptop', warn: false };
  }
  /*
   * BIG-12 (27A-5): the basic assistant is retired, his call — "Retire it,
   * Atlas for all" — so nothing else answers. What is left is a pick that
   * cannot run anywhere: a local model with the laptop away, or no account to
   * run Atlas here for. Each sentence names the one thing that fixes it.
   */
  if (!signedIn) return { text: 'Sign in to talk to Atlas.', warn: true };
  return {
    text:
      atlasStatus === 'asleep' || atlasStatus === 'unconfigured'
        ? 'The laptop is asleep — pick Gemini, Claude or ChatGPT to talk to Atlas here.'
        : 'Checking the laptop…',
    warn: atlasStatus !== 'unknown',
  };
}
