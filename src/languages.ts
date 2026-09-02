/**
 * One table, not one file per language (PRD §17's real requirement is that
 * language logic lives in exactly one place, which this satisfies).
 * Adding a language = adding a row.
 */
interface LanguageDef {
  /** Canonical display name used in metadata, READMEs and statistics. */
  canonical: string;
  /** Solution file extension, without the dot. */
  ext: string;
  /** Lowercase platform-reported spellings that map to this language. */
  aliases: string[];
}

const LANGUAGES: LanguageDef[] = [
  {
    canonical: "C++",
    ext: "cpp",
    aliases: ["cpp", "c++", "g++", "cpp14", "cpp17", "cpp20", "cpp23"],
  },
  { canonical: "Java", ext: "java", aliases: ["java", "java8", "java11", "java17"] },
  { canonical: "Python", ext: "py", aliases: ["python", "python3", "py", "py3", "pypy3"] },
  { canonical: "JavaScript", ext: "js", aliases: ["javascript", "js", "node", "nodejs"] },
];

/**
 * Never blocks a sync on an unrecognized language: an unknown name is kept
 * verbatim with a `.txt` extension so the solution still reaches GitHub
 * (PRD §18 — sync should continue when metadata is imperfect).
 */
export function resolveLanguage(raw: string): LanguageDef {
  const key = raw.trim().toLowerCase();
  if (!key) return { canonical: "Unknown", ext: "txt", aliases: [] };
  const known = LANGUAGES.find(
    (lang) => lang.canonical.toLowerCase() === key || lang.aliases.includes(key),
  );
  return known ?? { canonical: raw.trim(), ext: "txt", aliases: [] };
}
