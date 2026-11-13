const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/g;
const INDIAN_MOBILE_CORE_REGEX = /^[6-9]\d{9}$/;
const INDIAN_PIN_REGEX = /^[1-9]\d{5}$/;
const DEVANAGARI_REGEX = /\p{Script=Devanagari}/u;

/**
 * Normalizes Unicode text (NFC so Devanagari combining marks compose cleanly),
 * strips zero-width characters, and trims surrounding whitespace.
 * Whitespace-only input always resolves to "".
 */
export function normalizeWhitespace(value: string): string {
  return value
    .normalize("NFC")
    .replace(ZERO_WIDTH_REGEX, "")
    .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .trim();
}

export function containsDevanagari(value: string): boolean {
  return DEVANAGARI_REGEX.test(value);
}

/**
 * Extracts up to 10 core Indian mobile digits from 10-digit, 0-prefixed, or +91/91-prefixed inputs
 * without truncating valid +91 pasted numbers.
 */
export function extractIndianPhoneDigits(raw: string): string {
  const trimmed = normalizeWhitespace(raw);
  if (!trimmed) return "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }
  return digits.slice(0, 10);
}

/**
 * Validates Indian mobile numbers accepting 10-digit ([6-9]XXXXXXXXX), 0-prefixed,
 * or +91/91-prefixed formats and rejecting foreign country codes or malformed numbers.
 */
export function parseIndianPhone(
  raw: string
): { valid: true; digits: string; e164: string } | { valid: false; error: string } {
  const trimmed = normalizeWhitespace(raw);
  if (!trimmed) {
    return { valid: false, error: "Phone number is required." };
  }
  if (trimmed.startsWith("+") && !trimmed.startsWith("+91")) {
    return {
      valid: false,
      error: "Please enter a valid Indian mobile number (+91 or 10 digits).",
    };
  }

  const digitsOnly = trimmed.replace(/\D/g, "");
  let core = digitsOnly;
  if (trimmed.startsWith("+91")) {
    core = digitsOnly.length === 12 ? digitsOnly.slice(2) : "";
  } else if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
    core = digitsOnly.slice(2);
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
    core = digitsOnly.slice(1);
  }

  if (!INDIAN_MOBILE_CORE_REGEX.test(core)) {
    return {
      valid: false,
      error: "Please enter a valid 10-digit Indian mobile number (+91 / starts with 6, 7, 8, or 9).",
    };
  }

  return { valid: true, digits: core, e164: `+91${core}` };
}

/**
 * Validates a 6-digit Indian PIN code (e.g. 302020), allowing spaced 3+3 input ("302 020")
 * and rejecting leading zero ("000000"), short/long strings, or non-digits.
 */
export function parseIndianPinCode(
  raw: string | null | undefined
): { valid: true; value: string } | { valid: false; error: string } {
  const compact = normalizeWhitespace(String(raw ?? "")).replace(/\s+/g, "");
  if (!compact) {
    return { valid: false, error: "PIN code is required." };
  }
  if (!INDIAN_PIN_REGEX.test(compact)) {
    return {
      valid: false,
      error: "PIN code must be a valid 6-digit Indian postal code (e.g. 302020).",
    };
  }
  return { valid: true, value: compact };
}

