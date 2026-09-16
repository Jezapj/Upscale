import sqlJsSource from "sql.js/dist/sql-wasm-browser.js?raw";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";

export type SqlJsStatic = {
  Database: new (data?: ArrayLike<number>) => {
    exec: (sql: string) => { values: unknown[][] }[];
    close: () => void;
  };
};

type InitSqlJs = (config?: {
  locateFile?: (file: string) => string;
}) => Promise<SqlJsStatic>;

function evalCjs(source: string): unknown {
  const module = { exports: {} as Record<string, unknown> };
  const exports = module.exports;
  const run = new Function(
    "module",
    "exports",
    `${source}\nreturn module.exports;`,
  );
  return run(module, exports);
}

function asInit(value: unknown): InitSqlJs | null {
  if (typeof value === "function") return value as InitSqlJs;
  if (value && typeof value === "object") {
    const rec = value as Record<string, unknown>;
    for (const key of ["default", "Module", "initSqlJs"]) {
      if (typeof rec[key] === "function") return rec[key] as InitSqlJs;
    }
  }
  return null;
}

/** sql.js ships as CJS; Vite ESM import yields an empty module. Run it as CJS instead. */
export async function openSqlite(bytes: Uint8Array): Promise<{
  exec: (sql: string) => { values: unknown[][] }[];
  close: () => void;
}> {
  const initSqlJs = asInit(evalCjs(sqlJsSource));
  if (!initSqlJs) {
    throw new Error("Couldn't load SQLite for Anki import.");
  }
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  return new SQL.Database(bytes);
}
