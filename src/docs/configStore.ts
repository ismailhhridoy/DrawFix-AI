// Server-only: reads and writes the /docs settings file. Never import this from client code.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_DOCS_CONFIG, type DocsConfig } from './access';

const DIR = path.resolve(process.cwd(), 'data');
const FILE = path.join(DIR, 'docs-config.json');
const HISTORY = path.join(DIR, 'docs-history.json');
const MAX_HISTORY = 50;

export function readDocsConfig(): DocsConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<DocsConfig>;
    return { ...DEFAULT_DOCS_CONFIG, ...parsed };
  } catch {
    // Missing or unreadable file means the default: closed.
    return DEFAULT_DOCS_CONFIG;
  }
}

/** Writes the new settings and keeps the previous one in a history file, so changes can be traced. */
export function writeDocsConfig(next: DocsConfig): void {
  fs.mkdirSync(DIR, { recursive: true });
  const previous = readDocsConfig();
  let history: unknown[] = [];
  try {
    history = JSON.parse(fs.readFileSync(HISTORY, 'utf8')) as unknown[];
  } catch {
    history = [];
  }
  history.push({ replacedAt: new Date().toISOString(), previous });
  fs.writeFileSync(HISTORY, JSON.stringify(history.slice(-MAX_HISTORY), null, 2));
  fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
}
