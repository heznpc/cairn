/**
 * Locale support for the strings cairn *generates*.
 *
 * POI and road names are passed through from OSM untouched: a 약도 printed on
 * a card should read like the signs around it, so the local name is the right
 * name regardless of who reads the map. "Rue de Rivoli" stays French in Paris.
 *
 * That leaves two generated strings that genuinely need a language: the label
 * for an unnamed transit exit (OSM gives us `ref=3`, not a name) and the
 * fallback destination label when the caller passes none. Both used to be
 * hardcoded Korean, which printed "3번 출구" and "여기" on London maps.
 *
 * Resolution order is explicit language -> geocoded country -> English, so a
 * Seoul address still renders "3번 출구" with no flags while a London address
 * renders "Exit 3".
 */

export const DEFAULT_LANGUAGE = "en";

interface GeneratedLabels {
  /** Unnamed transit exit, from an OSM `ref` (e.g. "3" -> "Exit 3"). */
  exit: (ref: string) => string;
  /** Fallback destination label when the caller supplies none. */
  here: string;
}

// Only languages we can spell the two generated strings correctly in. This is
// deliberately a short, verifiable list rather than a machine-translated long
// tail — a wrong exit label is worse than an English one.
const LABELS: Record<string, GeneratedLabels> = {
  ko: { exit: (ref) => `${ref}번 출구`, here: "여기" },
  ja: { exit: (ref) => `${ref}番出口`, here: "ここ" },
  zh: { exit: (ref) => `${ref}号出口`, here: "这里" },
  en: { exit: (ref) => `Exit ${ref}`, here: "Here" },
  de: { exit: (ref) => `Ausgang ${ref}`, here: "Hier" },
  fr: { exit: (ref) => `Sortie ${ref}`, here: "Ici" },
  es: { exit: (ref) => `Salida ${ref}`, here: "Aquí" },
  it: { exit: (ref) => `Uscita ${ref}`, here: "Qui" },
  pt: { exit: (ref) => `Saída ${ref}`, here: "Aqui" },
  nl: { exit: (ref) => `Uitgang ${ref}`, here: "Hier" },
  pl: { exit: (ref) => `Wyjście ${ref}`, here: "Tutaj" },
  sv: { exit: (ref) => `Utgång ${ref}`, here: "Här" },
  tr: { exit: (ref) => `Çıkış ${ref}`, here: "Burada" },
  ru: { exit: (ref) => `Выход ${ref}`, here: "Здесь" },
  uk: { exit: (ref) => `Вихід ${ref}`, here: "Тут" },
};

// Country -> language for the auto default. Only unambiguous majority cases:
// multilingual countries (be, ca, ch, in, sg, za) are intentionally absent so
// they fall through to English instead of guessing wrong for half the country.
const COUNTRY_LANGUAGE: Record<string, string> = {
  kr: "ko",
  jp: "ja",
  cn: "zh",
  tw: "zh",
  hk: "zh",
  mo: "zh",
  de: "de",
  at: "de",
  fr: "fr",
  mc: "fr",
  es: "es",
  mx: "es",
  ar: "es",
  cl: "es",
  co: "es",
  pe: "es",
  uy: "es",
  it: "it",
  sm: "it",
  pt: "pt",
  br: "pt",
  nl: "nl",
  pl: "pl",
  se: "sv",
  tr: "tr",
  ru: "ru",
  ua: "uk",
};

/**
 * Reduce a BCP-47-ish tag to a primary subtag we can look up ("ko-KR" -> "ko",
 * "en_US" -> "en"). Returns undefined for anything that isn't a plausible
 * language subtag so callers fall through to the next resolution step.
 */
export function normalizeLanguage(value?: string): string | undefined {
  if (!value) return undefined;
  const primary = value.trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(primary) ? primary : undefined;
}

/** Map an ISO 3166-1 alpha-2 country code (Nominatim's `country_code`). */
export function languageForCountry(countryCode?: string): string | undefined {
  if (!countryCode) return undefined;
  return COUNTRY_LANGUAGE[countryCode.trim().toLowerCase()];
}

/**
 * Pick the language for generated labels. Falls back to English when the
 * resolved language has no verified strings, so an unsupported locale degrades
 * to "Exit 3" rather than to Korean.
 */
export function resolveLabelLanguage(
  explicit?: string,
  countryCode?: string,
): string {
  const requested = normalizeLanguage(explicit) ?? languageForCountry(countryCode);
  return requested && requested in LABELS ? requested : DEFAULT_LANGUAGE;
}

/** True when cairn can spell its generated labels in `language`. */
export function isSupportedLabelLanguage(language: string): boolean {
  const normalized = normalizeLanguage(language);
  return normalized !== undefined && normalized in LABELS;
}

export const SUPPORTED_LABEL_LANGUAGES: readonly string[] = Object.keys(LABELS);

function labelsFor(language?: string): GeneratedLabels {
  const normalized = normalizeLanguage(language);
  return (normalized && LABELS[normalized]) || LABELS[DEFAULT_LANGUAGE];
}

/** Label for an unnamed transit exit carrying only an OSM `ref`. */
export function exitLabel(ref: string, language?: string): string {
  return labelsFor(language).exit(ref);
}

/** Fallback destination label ("여기" / "Here" / "Ici" ...). */
export function hereLabel(language?: string): string {
  return labelsFor(language).here;
}

/**
 * Accept-Language for Nominatim, or undefined to let Nominatim answer in the
 * local language. Omitting the header is the correct global default: it yields
 * the OSM `name` tag, which is what the reader will see on the street.
 */
export function acceptLanguageHeader(language?: string): string | undefined {
  const normalized = normalizeLanguage(language);
  if (!normalized) return undefined;
  return normalized === "en" ? "en" : `${normalized},en;q=0.8`;
}
