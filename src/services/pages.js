import { db } from '../db/index.js';

// Alle Textseiten an einer Stelle. Eine neue Seite braucht später nur einen Eintrag hier.
export const PAGES = {
  rules: { titleKey: 'nav.rules', path: '/rules' },
  imprint: { titleKey: 'nav.imprint', path: '/imprint' },
};

export function getPage(slug) {
  return db.prepare('SELECT slug, content, updated_at FROM pages WHERE slug = ?').get(slug) ?? null;
}

export function savePage(slug, content) {
  db.prepare(
    `INSERT INTO pages (slug, content) VALUES (?, ?)
     ON CONFLICT(slug) DO UPDATE SET content = excluded.content, updated_at = datetime('now')`,
  ).run(slug, content);
}