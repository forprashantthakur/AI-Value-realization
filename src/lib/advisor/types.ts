export interface AdvisorTable {
  columns: string[];
  rows: (string | number)[][];
}

export interface AdvisorAnswer {
  question: string;
  intent: string;
  /** Deterministic narrative built only from engine outputs. */
  text: string;
  bullets?: string[];
  table?: AdvisorTable;
  links?: { label: string; href: string }[];
  /** Every number quoted in `text` — used to guard any LLM rephrasing. */
  facts: Record<string, string>;
  narratedBy: "deterministic" | string;
}

/**
 * LLM abstraction. A provider may only REPHRASE a deterministic answer. It never receives raw
 * data access and its output is rejected if it introduces numbers not present in `facts`.
 */
export interface AdvisorNarrator {
  name: string;
  narrate(answer: AdvisorAnswer): Promise<string>;
}
