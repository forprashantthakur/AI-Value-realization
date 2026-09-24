import type { AdvisorAnswer, AdvisorNarrator } from "./types";

/** Default narrator: returns the deterministic text unchanged. */
export const deterministicNarrator: AdvisorNarrator = {
  name: "deterministic",
  async narrate(a) {
    return a.text;
  },
};

/**
 * Guard for any future LLM narrator: every number in the rephrased text must already be present
 * in the deterministic answer, otherwise the deterministic text is used.
 */
export function guardNumbers(original: AdvisorAnswer, rephrased: string): string {
  const allowed = new Set((original.text + " " + Object.values(original.facts).join(" ")).match(/\d[\d,.]*/g) ?? []);
  const used = rephrased.match(/\d[\d,.]*/g) ?? [];
  return used.every((n) => allowed.has(n)) ? rephrased : original.text;
}

export function getNarrator(): AdvisorNarrator {
  // Plug-in point: return an LLM-backed narrator when ADVISOR_LLM_PROVIDER is configured.
  // It must only receive the AdvisorAnswer (never raw data) and its output passes guardNumbers().
  return deterministicNarrator;
}
