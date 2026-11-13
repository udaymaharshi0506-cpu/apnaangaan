export const JAIPUR_LOCALITIES = [
  "Mansarovar, Jaipur",
  "Vaishali Nagar, Jaipur",
  "Malviya Nagar, Jaipur",
  "Jagatpura, Jaipur",
  "C-Scheme, Jaipur",
  "Raja Park, Jaipur",
  "Tonk Road, Jaipur",
  "Ajmer Road, Jaipur",
  "Bapu Nagar, Jaipur",
  "Bani Park, Jaipur",
  "Sodala, Jaipur",
  "Pratap Nagar, Jaipur",
  "Vidhyadhar Nagar, Jaipur",
  "Gopalpura, Jaipur",
  "Sitapura, Jaipur",
  "Jhotwara, Jaipur",
  "Durgapura, Jaipur",
  "Shyam Nagar, Jaipur",
] as const;

const SPELLING_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ["mansarovar", "mansarowar", "mansrover", "mansrovar", "mansarover", "mansarvor"],
  ["vaishali nagar", "vaishalinagar", "vashali nagar", "vashali", "vaishali", "veshali nagar", "veshali"],
  ["malviya nagar", "malviyanagar", "malavia nagar", "malavia", "malviya", "malwiya nagar"],
  ["jagatpura", "jagtpur", "jagtpura", "jagatpur"],
  ["c-scheme", "c scheme", "cscheme", "see scheme"],
  ["raja park", "rajapark"],
  ["bapu nagar", "bapunagar"],
  ["bani park", "banipark"],
  ["pratap nagar", "pratapnagar"],
  ["vidhyadhar nagar", "vidyadhar nagar", "vidhyadharnagar", "vidyadharnagar", "vdn"],
  ["tonk road", "tonkroad", "tonk rd"],
  ["ajmer road", "ajmerroad", "ajmer rd"],
  ["shyam nagar", "shyamnagar", "sham nagar"],
  ["gopalpura", "gopal pura", "gopalpura bypass"],
  ["jhotwara", "jhotwada"],
  ["durgapura", "durgapur", "durgapora"],
  ["sodala", "sodhala"],
  ["sitapura", "sitapur"],
  ["jaipur", "jaypur", "pink city"],
  ["bengaluru", "bangalore", "banglore", "blr"],
  ["gurugram", "gurgaon"],
  ["mumbai", "bombay"],
  ["new delhi", "delhi", "ncr"],
  ["hyderabad", "hyd", "hydrabad"],
  ["pune", "poona"],
  ["ahmedabad", "amdavad"],
];

function normalizeSearchToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Expands a search phrase into spelling, spacing, and BHK variants for Jaipur and major cities.
 */
export function expandLocationSearchVariants(rawQuery: string): string[] {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [];

  const primaryChunk = trimmed.split(",")[0]?.trim() || trimmed;
  const candidates = new Set<string>([trimmed]);
  if (primaryChunk && primaryChunk.length >= 2) {
    candidates.add(primaryChunk);
  }

  const normalizedInputs = Array.from(
    new Set([normalizeSearchToken(trimmed), normalizeSearchToken(primaryChunk)].filter(Boolean))
  );

  for (const input of normalizedInputs) {
    candidates.add(input);
    const compact = input.replace(/\s+/g, "");

    const bhkMatch = input.match(/^(\d+)\s*bhk$/i);
    if (bhkMatch) {
      candidates.add(`${bhkMatch[1]} bhk`);
      candidates.add(`${bhkMatch[1]}bhk`);
    }

    for (const group of SPELLING_ALIAS_GROUPS) {
      const matched = group.some((alias) => {
        const normAlias = normalizeSearchToken(alias);
        const compactAlias = normAlias.replace(/\s+/g, "");
        return (
          input === normAlias ||
          compact === compactAlias ||
          input.includes(normAlias) ||
          (input.length >= 4 && normAlias.startsWith(input)) ||
          (compact.length >= 4 && compactAlias.startsWith(compact))
        );
      });

      if (matched) {
        for (const alias of group) {
          candidates.add(alias);
        }
      }
    }
  }

  return Array.from(candidates)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 2);
}

/**
 * Filters and ranks location suggestions using spelling-variant expansion across DB entries and curated localities.
 */
export function filterLocationSuggestions(
  rawQuery: string,
  dbSuggestions: string[],
  fallbackCities: string[],
  limit = 10
): string[] {
  const merged = Array.from(
    new Set(
      [...dbSuggestions, ...JAIPUR_LOCALITIES, ...fallbackCities]
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return merged.slice(0, limit);
  }

  const variants = expandLocationSearchVariants(trimmed).map(normalizeSearchToken);
  const compactVariants = variants.map((v) => v.replace(/\s+/g, ""));
  const directNorm = normalizeSearchToken(trimmed);

  const scored: { label: string; score: number }[] = [];

  for (const label of merged) {
    const normLabel = normalizeSearchToken(label);
    const compactLabel = normLabel.replace(/\s+/g, "");

    let bestScore = -1;
    if (normLabel.startsWith(directNorm)) {
      bestScore = 100;
    } else if (normLabel.includes(directNorm)) {
      bestScore = 80;
    } else {
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const cv = compactVariants[i];
        if (normLabel.startsWith(v) || compactLabel.startsWith(cv)) {
          bestScore = Math.max(bestScore, 70);
        } else if (normLabel.includes(v) || compactLabel.includes(cv)) {
          bestScore = Math.max(bestScore, 50);
        }
      }
    }

    if (bestScore >= 0) {
      scored.push({ label, score: bestScore });
    }
  }

  scored.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  return scored.slice(0, limit).map((item) => item.label);
}

