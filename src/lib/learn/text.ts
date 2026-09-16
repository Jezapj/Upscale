export const ANKI_FIELD_SEP = "\x1f";

export function splitAnkiFieldsRaw(flds: string): string[] {
  return flds.split(ANKI_FIELD_SEP);
}

export function extractSoundNames(raw: string): string[] {
  const out: string[] = [];
  const re = /\[sound:([^\]]+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) out.push(m[1].trim());
  return out;
}

export function extractImageNames(raw: string): string[] {
  const out: string[] = [];
  const re = /<img\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)["']?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const src = m[1].trim().replace(/^.*\//, "");
    if (src) out.push(src);
  }
  return out;
}

/** Convert Anki ruby 何[なに] to 何. */
export function stripAnkiRuby(raw: string): string {
  return raw.replace(/([^\s[\]]+)\s*\[([^\]\s]{1,40})\]/g, "$1");
}

/** Strip Anki HTML / cloze markup down to readable plain text. */
export function stripAnkiHtml(raw: string): string {
  let s = raw ?? "";
  s = s.replace(/\{\{c\d+::(.*?)(?:::(.*?))?\}\}/g, (_, text) => text);
  s = s.replace(/\[\s*sound:[^\]]*\]/gi, "");
  s = stripAnkiRuby(s);
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/(p|div|li|tr)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&lt;/g, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#39;/g, "'");
  s = s.replace(/&[#a-zA-Z0-9]+;/g, " ");
  s = s.replace(/[\u2000-\u200d\u202f\u205f\u3000]/g, " ");
  s = s.replace(/[ \t]+\n/g, "\n");
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

export function splitAnkiFields(flds: string): string[] {
  return splitAnkiFieldsRaw(flds).map((f) => stripAnkiHtml(f));
}

const JUNK_FIELD_NAME =
  /^(sequence|version|audio|image|picture|questionlink|references|tags|id|nid|guid|jlab-metadata|jlab-dictionarylookup|jlab-remarks)$/i;

const JUNK_LINE =
  /^(link|\d{8,}|https?:\/\/\S+)$/i;

export function isJunkFieldName(name: string): boolean {
  return JUNK_FIELD_NAME.test(name.trim());
}

export function isJunkLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  return JUNK_LINE.test(t);
}

export function dedupeCardText(text: string): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (isJunkLine(line)) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines.join("\n").trim();
}

export function fieldMap(
  names: string[],
  values: string[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < names.length; i++) {
    map.set(names[i], values[i] ?? "");
    map.set(names[i].toLowerCase(), values[i] ?? "");
  }
  return map;
}

export function getField(map: Map<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const v = map.get(key) ?? map.get(key.toLowerCase());
    if (v && v.trim() && !isJunkLine(v)) return v.trim();
  }
  return "";
}

const TEMPLATE_FIELD_RE =
  /\{\{\s*(?:#|\/|\^)?(?:type:|hint:|text:|cloze:|furigana:|kanji:|kana:|audio:)?([^}]+?)\s*\}\}/gi;

export function templateFieldNames(fmt: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(TEMPLATE_FIELD_RE.source, "gi");
  while ((m = re.exec(fmt))) {
    const name = m[1].trim();
    if (!name || /^frontside$/i.test(name)) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    names.push(name);
  }
  return names;
}

function applyMustache(fmt: string, map: Map<string, string>): string {
  let s = fmt;
  s = s.replace(
    /\{\{#([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/gi,
    (_all, name, inner) => (getField(map, String(name).trim()) ? inner : ""),
  );
  s = s.replace(
    /\{\{\^([^}]+)\}\}([\s\S]*?)\{\{\/\1\}\}/gi,
    (_all, name, inner) => (getField(map, String(name).trim()) ? "" : inner),
  );
  s = s.replace(/\{\{FrontSide\}\}/gi, "");
  s = s.replace(
    /\{\{\s*(?:type:|hint:|text:|cloze:|furigana:|kanji:|kana:|audio:)?([^}]+?)\s*\}\}/gi,
    (_all, name) => getField(map, String(name).trim()),
  );
  return s;
}

export function renderTemplate(
  fmt: string | undefined,
  map: Map<string, string>,
): string {
  if (!fmt) return "";
  return dedupeCardText(stripAnkiHtml(applyMustache(fmt, map)));
}

const NAMED_FRONT = [
  "Other-Front",
  "Front",
  "Expression",
  "Word",
  "Sentence",
  "Question",
  "Kanji",
  "Jlab-Kanji",
  "Jlab-KanjiSpaced",
  "Jlab-KanjiCloze",
];

const NAMED_BACK = [
  "RemarksBack",
  "Meaning",
  "Glossary",
  "Definition",
  "Translation",
  "English",
  "Jlab-Translation",
  "Other-Back",
  "Back",
  "Answer",
];

const NAMED_READING = [
  "Jlab-Hiragana",
  "Jlab-HiraganaCloze",
  "Reading",
  "Furigana",
  "Kana",
  "Jlab-ListeningFront",
];

export function looksLikeMultiFieldNote(names: string[]): boolean {
  const n = names.map((x) => x.toLowerCase());
  return n.some(
    (x) =>
      x.includes("other-front") ||
      x.includes("jlab-") ||
      x.includes("remarksback") ||
      x === "expression" ||
      x === "meaning",
  );
}

export function composeFromNamedFields(
  names: string[],
  cleaned: string[],
): { front: string; back: string } {
  const map = fieldMap(names, cleaned);
  const front = getField(map, ...NAMED_FRONT);
  const meaning = getField(map, ...NAMED_BACK);
  const reading = getField(map, ...NAMED_READING);
  const source = getField(map, "Source");

  const backParts: string[] = [];
  if (meaning) backParts.push(meaning);
  if (reading && reading.toLowerCase() !== front.toLowerCase()) {
    backParts.push(reading);
  }
  if (source && source.length < 80) backParts.push(source);

  if (!front) {
    const first = cleaned.find(
      (v, i) => !isJunkFieldName(names[i] ?? "") && !isJunkLine(v),
    );
    return {
      front: first || "(blank)",
      back: dedupeCardText(backParts.join("\n")),
    };
  }

  return {
    front: dedupeCardText(front),
    back: dedupeCardText(backParts.join("\n")),
  };
}

export function composeAnkiCard(
  names: string[],
  rawFields: string[],
  qfmt?: string,
  afmt?: string,
): { front: string; back: string } {
  const cleaned = rawFields.map((f) => stripAnkiHtml(f));
  if (looksLikeMultiFieldNote(names)) {
    const named = composeFromNamedFields(names, cleaned);
    if (named.front && named.front !== "(blank)") return named;
  }

  const map = fieldMap(names, cleaned);
  const fromTmpl = {
    front: renderTemplate(qfmt, map),
    back: renderTemplate(afmt, map),
  };
  if (fromTmpl.front || fromTmpl.back) {
    if (fromTmpl.front === fromTmpl.back) {
      fromTmpl.back = "";
    }
    return {
      front: fromTmpl.front || "(blank)",
      back: fromTmpl.back,
    };
  }

  const named = composeFromNamedFields(names, cleaned);
  if (named.front !== "(blank)" || named.back) return named;

  const usable = names
    .map((name, i) => ({ name, value: cleaned[i] ?? "" }))
    .filter((f) => !isJunkFieldName(f.name) && !isJunkLine(f.value));
  return {
    front: usable[0]?.value || "(blank)",
    back: dedupeCardText(usable.slice(1).map((f) => f.value).join("\n")),
  };
}
