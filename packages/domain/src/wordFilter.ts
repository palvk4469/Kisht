// RBI's recovery rules forbid harassment. Anything sent to a borrower that isn't
// a fixed approved template must pass this first; a match blocks it outright.

const BLOCKED: readonly string[] = [
  // English
  "arrest",
  "police",
  "jail",
  "prison",
  "court",
  "seize",
  "seizure",
  "legal action",
  "shame",
  "expose",
  "threat",
  "consequences",
  "last warning",
  "final warning",
  "your family",
  "defaulter",
  "cheat",
  "fraud",
  "beat",
  "harm",
  // Hindi
  "गिरफ्तार",
  "गिरफ़्तार",
  "पुलिस",
  "जेल",
  "अदालत",
  "कोर्ट",
  "जब्त",
  "ज़ब्त",
  "कुर्की",
  "बदनाम",
  "धमकी",
  "अंजाम",
  "आखिरी चेतावनी",
  "अंतिम चेतावनी",
  "परिवार",
  "धोखेबाज़",
  "धोखेबाज",
  "ठग",
  "मारेंगे",
  "देख लेंगे",
  "उठवा",
];

/** The blocked words a message contains; empty means it may go. */
export function findBlockedWords(text: string): string[] {
  const lower = text.toLowerCase();
  return BLOCKED.filter((word) => {
    if (/^[\x20-\x7e]+$/.test(word)) {
      // Whole words, so "beat" doesn't catch "unbeatable" or "court" "courtesy".
      return new RegExp(`\\b${word}\\b`, "i").test(lower);
    }
    return lower.includes(word);
  });
}
