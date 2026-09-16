import JSZip from "jszip";
import {
  composeAnkiCard,
  extractImageNames,
  extractSoundNames,
  splitAnkiFieldsRaw,
  stripAnkiHtml,
} from "./text";

export interface ImportCard {
  front: string;
  back: string;
  audio?: Blob;
  image?: Blob;
}

export interface ImportDeckPreview {
  name: string;
  cards: ImportCard[];
}

export interface DeckImportResult {
  decks: ImportDeckPreview[];
  skippedMedia: boolean;
  mediaCount: number;
  cardCount: number;
  source: "anki" | "csv";
}

export const SYNC_CARD_WARN = 2000;

function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

export function parseDelimitedDeck(
  text: string,
  fileName?: string,
): DeckImportResult {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) {
    return {
      decks: [],
      skippedMedia: false,
      mediaCount: 0,
      cardCount: 0,
      source: "csv",
    };
  }
  const delim = lines[0].includes("\t") ? "\t" : ",";
  let start = 0;
  const first = parseCsvLine(lines[0], delim).map((c) => c.toLowerCase());
  if (
    first.length >= 2 &&
    (first[0] === "front" || first[0] === "question") &&
    (first[1] === "back" || first[1] === "answer")
  ) {
    start = 1;
  }
  const cards: ImportCard[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], delim);
    const front = stripAnkiHtml(cols[0] ?? "");
    const back = stripAnkiHtml(cols.slice(1).join(delim === "\t" ? "\t" : ", "));
    if (!front && !back) continue;
    cards.push({ front: front || "(blank)", back });
  }
  const name = fileName?.replace(/\.[^.]+$/, "") || "Imported deck";
  return {
    decks: [{ name, cards }],
    skippedMedia: false,
    mediaCount: 0,
    cardCount: cards.length,
    source: "csv",
  };
}

interface AnkiDeckMeta {
  name: string;
}

interface AnkiModel {
  flds: { name: string }[];
  tmpls: { qfmt?: string; afmt?: string }[];
}

type MediaEntry = { async: (t: "arraybuffer") => Promise<ArrayBuffer> };

async function loadMediaLookup(zip: JSZip): Promise<Map<string, MediaEntry>> {
  const lookup = new Map<string, MediaEntry>();
  const mediaFile = zip.file("media");
  if (mediaFile) {
    try {
      const raw = await mediaFile.async("string");
      const parsed = JSON.parse(raw) as Record<string, string>;
      for (const [idx, name] of Object.entries(parsed)) {
        const entry = zip.file(String(idx));
        if (entry && name) {
          lookup.set(name, entry);
          lookup.set(name.replace(/^.*[\\/]/, ""), entry);
        }
      }
    } catch {
      // media map missing or not JSON
    }
  }
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const base = path.replace(/^.*[\\/]/, "");
    if (!lookup.has(base)) lookup.set(base, entry);
  }
  return lookup;
}

function mimeForName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "ogg" || ext === "oga") return "audio/ogg";
  if (ext === "wav") return "audio/wav";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

async function blobForName(
  lookup: Map<string, MediaEntry>,
  name: string,
): Promise<Blob | undefined> {
  const entry = lookup.get(name) || lookup.get(name.replace(/^.*[\\/]/, ""));
  if (!entry) return undefined;
  const buf = await entry.async("arraybuffer");
  return new Blob([buf], { type: mimeForName(name) });
}

function firstMedia(
  fields: string[],
  extract: (raw: string) => string[],
): string | undefined {
  for (const field of fields) {
    const names = extract(field);
    if (names[0]) return names[0];
  }
  return undefined;
}

export async function parseApkg(
  buffer: ArrayBuffer,
  fileName?: string,
): Promise<DeckImportResult> {
  const zip = await JSZip.loadAsync(buffer);
  const dbFile =
    zip.file("collection.anki21") ||
    zip.file("collection.anki2") ||
    zip.file("collection.anki21b");
  if (!dbFile) {
    throw new Error("This file doesn't look like an Anki deck (.apkg).");
  }
  const lookup = await loadMediaLookup(zip);
  const bytes = await dbFile.async("uint8array");
  const { openSqlite } = await import("./sqlJs");
  const db = await openSqlite(bytes);

  let deckMap: Record<string, AnkiDeckMeta> = {};
  let models: Record<string, AnkiModel> = {};
  try {
    const col = db.exec("SELECT decks, models FROM col");
    const deckRaw = col[0]?.values[0]?.[0];
    const modelRaw = col[0]?.values[0]?.[1];
    if (typeof deckRaw === "string") {
      const parsed = JSON.parse(deckRaw) as Record<string, { name?: string }>;
      for (const [id, d] of Object.entries(parsed)) {
        deckMap[id] = { name: d.name || "Deck" };
      }
    }
    if (typeof modelRaw === "string") {
      models = JSON.parse(modelRaw) as Record<string, AnkiModel>;
    }
  } catch {
    deckMap = {};
    models = {};
  }

  type Note = { mid: string; fields: string[] };
  const notes = new Map<number, Note>();
  try {
    const noteRows = db.exec("SELECT id, mid, flds FROM notes");
    for (const row of noteRows[0]?.values ?? []) {
      const id = Number(row[0]);
      notes.set(id, {
        mid: String(row[1] ?? ""),
        fields: splitAnkiFieldsRaw(String(row[2] ?? "")),
      });
    }
  } catch {
    db.close();
    throw new Error("Couldn't read notes from this Anki deck.");
  }

  const buckets = new Map<string, ImportCard[]>();
  let mediaCount = 0;
  try {
    const cardRows = db.exec("SELECT nid, did, ord FROM cards");
    for (const row of cardRows[0]?.values ?? []) {
      const nid = Number(row[0]);
      const did = String(row[1] ?? "1");
      const ord = Number(row[2] ?? 0);
      const note = notes.get(nid);
      if (!note) continue;
      const model = models[note.mid] ?? Object.values(models)[0];
      const names = model?.flds?.map((f) => f.name) ?? note.fields.map((_, i) => `Field ${i + 1}`);
      const tmpl = model?.tmpls?.[ord] ?? model?.tmpls?.[0];
      const sides = composeAnkiCard(names, note.fields, tmpl?.qfmt, tmpl?.afmt);
      if (!sides.front && !sides.back) continue;

      const sound = firstMedia(note.fields, extractSoundNames);
      const image = firstMedia(note.fields, extractImageNames);
      let audio: Blob | undefined;
      let imageBlob: Blob | undefined;
      try {
        if (sound) audio = await blobForName(lookup, sound);
        if (audio) mediaCount++;
      } catch {
        audio = undefined;
      }
      try {
        if (image) imageBlob = await blobForName(lookup, image);
        if (imageBlob) mediaCount++;
      } catch {
        imageBlob = undefined;
      }

      const list = buckets.get(did) ?? [];
      list.push({
        front: sides.front,
        back: sides.back,
        audio,
        image: imageBlob,
      });
      buckets.set(did, list);
    }
  } catch (e) {
    db.close();
    if (e instanceof Error && e.message.startsWith("Couldn't")) throw e;
    throw new Error("Couldn't read cards from this Anki deck.");
  }
  db.close();

  const decks: ImportDeckPreview[] = [];
  for (const [did, cards] of buckets) {
    if (cards.length === 0) continue;
    const name = deckMap[did]?.name || "";
    if (name.toLowerCase() === "default" && cards.length === 0) continue;
    decks.push({
      name: name || fileName?.replace(/\.[^.]+$/, "") || "Anki deck",
      cards,
    });
  }

  const cardCount = decks.reduce((n, d) => n + d.cards.length, 0);
  return {
    decks,
    skippedMedia: mediaCount === 0 && lookup.size > 0,
    mediaCount,
    cardCount,
    source: "anki",
  };
}

export async function parseDeckFile(file: File): Promise<DeckImportResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".apkg") || name.endsWith(".colpkg") || name.endsWith(".zip")) {
    return parseApkg(await file.arrayBuffer(), file.name);
  }
  const text = await file.text();
  return parseDelimitedDeck(text, file.name);
}
