const SPOKEN_DIGITS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

const SPOKEN_DIGIT_WORD_GLOBAL_REGEX = /\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/gi;
const SPOKEN_DIGIT_WORD_TEST_REGEX = /\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/i;
const MULTIPLIER_WORD_REGEX = /\b(double|triple)\s+(zero|one|two|three|four|five|six|seven|eight|nine|\d)\b/gi;
const MESSAGING_SUBSTRINGS = ["whatsapp", "watsapp", "whatsap", "telegram", "snapchat", "instagram"];
const DIRECT_MESSAGING_PHRASE_REGEX =
  /\b(?:wa\s*\.?\s*me|t\s*\.?\s*me|insta\s*(?:id|handle|dm|me)|dm\s+me|ping\s+me|call\s+me(?:\s+(?:on|at|directly))?|text\s+me(?:\s+(?:on|at))?|reach\s+me\s+(?:on|at)|contact\s+(?:me\s+)?(?:directly|on|at))\b/i;

const EMAIL_REGEX = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const OBFUSCATED_EMAIL_HANDLE_REGEX =
  /[a-z0-9._%+-]+@[a-z0-9.-]+|@\s*(?:gmail|yahoo|outlook|hotmail|icloud|proton(?:mail)?|rediff(?:mail)?|zoho|live|aol)\b|(?:gmail|yahoo|outlook|hotmail|icloud|protonmail|rediffmail)\s*(?:\.|\[?\s*dot\s*\]?|\(?\s*dot\s*\)?)\s*[a-z]{2,}/i;
const SOCIAL_HANDLE_REGEX = /(?:^|\s)@[a-z_][a-z0-9_.]{2,}/i;

const URL_PROTOCOL_REGEX = /(?:https?:\/\/|ftp:\/\/)\S+|\bwww\.[a-z0-9-]+/i;
const LITERAL_DOMAIN_REGEX =
  /\b[a-z0-9][a-z0-9-]*\.(?:com|in|co\.in|org|net|io|info|biz|me|xyz|app|site|online|link|ly)\b/i;
const WORD_DOT_DOMAIN_REGEX =
  /\b[a-z0-9][a-z0-9-]*\s*(?:\[|\()?\s*\bdot\b\s*(?:\]|\))?\s*(?:com|in|co\s+dot\s+in|org|net|io|info|biz|me|xyz|app|site|online|link|ly)\b|\b(?:dot|\[dot\]|\(dot\))\s*(?:com|org|net|co\.in)\b/i;

export type ContactViolationCategory = "phone" | "email" | "link" | "messaging";

export type ContactDetectionResult =
  | { blocked: false }
  | { blocked: true; category: ContactViolationCategory; reason: string };

/** Convert spoken number words ("nine eight", "double nine") into digits while keeping word separation intact. */
export function normalizeSpokenDigits(text: string): string {
  const cleaned = text.replace(/[\u200B-\u200D\uFEFF]/g, "");
  const expandedMultipliers = cleaned.replace(MULTIPLIER_WORD_REGEX, (_match, mult: string, word: string) => {
    const digit = SPOKEN_DIGITS[word.toLowerCase()] ?? word;
    const count = mult.toLowerCase() === "triple" ? 3 : 2;
    return digit.repeat(count);
  });
  return expandedMultipliers.replace(SPOKEN_DIGIT_WORD_GLOBAL_REGEX, (word) => SPOKEN_DIGITS[word.toLowerCase()] ?? word);
}

/** Normalize obfuscated email markers like "at", "[at]", "(dot)", "dot com" without merging sentence periods. */
function normalizeEmailText(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s*@\s*/g, "@")
    .replace(/@([a-z0-9-]+(?:\.[a-z0-9-]+)*)\s+\.\s+([a-z]{2,})/gi, "@$1.$2")
    .replace(/\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|\bat\b)\s*/gi, "@")
    .replace(/\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\bdot\b)\s*/gi, ".");
}

function hasPhoneLikeDigits(rawText: string, normalizedDigitsText: string): boolean {
  const hadSpokenDigits = SPOKEN_DIGIT_WORD_TEST_REGEX.test(rawText);
  const hadPhoneKeyword = /\b(?:call|phone|mob|mobile|contact|ring|dial|reach|num|number|whatsapp|wp|wa)\b/i.test(rawText);
  const clusters = normalizedDigitsText.match(/\d(?:[\s.\-_()*•·/\\|]*\d)*/g) || [];

  for (const cluster of clusters) {
    const digits = cluster.replace(/\D/g, "");
    if (digits.length >= 10) {
      if (digits.length <= 13) return true;
      if (/(?:91|0)?[6-9]\d{9}/.test(digits)) return true;
    }
    if ((hadSpokenDigits || hadPhoneKeyword) && digits.length >= 7) {
      return true;
    }
  }
  return false;
}

/** Detects phone numbers (digits or spoken words), emails (@ / [at] / dot com), messaging apps, and external URLs. */
export function detectContactInfo(value: string): ContactDetectionResult {
  if (!value || !value.trim()) return { blocked: false };

  const clean = value.replace(/[\u200B-\u200D\uFEFF]/g, "");
  const compactLetters = clean.toLowerCase().replace(/[^a-z]/g, "");

  if (
    MESSAGING_SUBSTRINGS.some((token) => compactLetters.includes(token)) ||
    DIRECT_MESSAGING_PHRASE_REGEX.test(clean)
  ) {
    return {
      blocked: true,
      category: "messaging",
      reason: "Direct messaging apps or contact prompts (like WhatsApp, Telegram, or DM requests) are not allowed. Our team coordinates all introductions privately.",
    };
  }

  const emailNormalized = normalizeEmailText(clean);
  if (
    EMAIL_REGEX.test(clean) ||
    EMAIL_REGEX.test(emailNormalized) ||
    OBFUSCATED_EMAIL_HANDLE_REGEX.test(clean) ||
    SOCIAL_HANDLE_REGEX.test(clean)
  ) {
    return {
      blocked: true,
      category: "email",
      reason: "Email addresses or social handles (@) cannot be shared here. Our team coordinates all introductions privately.",
    };
  }

  if (
    URL_PROTOCOL_REGEX.test(clean) ||
    LITERAL_DOMAIN_REGEX.test(clean) ||
    WORD_DOT_DOMAIN_REGEX.test(clean)
  ) {
    return {
      blocked: true,
      category: "link",
      reason: "External links or website domains cannot be included here.",
    };
  }

  const digitsNormalized = normalizeSpokenDigits(clean);
  if (hasPhoneLikeDigits(clean, digitsNormalized)) {
    return {
      blocked: true,
      category: "phone",
      reason: "Phone numbers (including spaced digits or number words) cannot be shared here. Our team coordinates all introductions privately.",
    };
  }

  return { blocked: false };
}

/** Validate a map of user-supplied text fields; returns the first offending field name and message, if any. */
export function findFirstContactViolation(
  input: Record<string, unknown>,
  fields: readonly string[]
): { field: string; reason: string; category: ContactViolationCategory } | null {
  for (const field of fields) {
    const value = input[field];
    if (typeof value === "string") {
      const check = detectContactInfo(value);
      if (check.blocked) {
        return { field, reason: check.reason, category: check.category };
      }
    }
  }
  return null;
}
