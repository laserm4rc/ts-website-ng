import { db } from '../db/index.js';

const SELECT = `
  SELECT n.id, n.title, n.summary, n.content, n.published, n.created_at, n.updated_at,
         u.username AS author
    FROM news n
    LEFT JOIN users u ON u.id = n.author_id`;

/** Veröffentlichte News, seitenweise. */
export function listPublishedNews({ page = 1, perPage = 5 } = {}) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM news WHERE published = 1').get().n;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, page), pages);

  const items = db
    .prepare(`${SELECT} WHERE n.published = 1 ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?`)
    .all(perPage, (current - 1) * perPage);

  return { items, page: current, pages, total };
}

/** Alle News inkl. Entwürfe (für den Admin-Bereich). */
export function listAllNews() {
  return db.prepare(`${SELECT} ORDER BY n.created_at DESC, n.id DESC`).all();
}

export function getNews(id, { includeDrafts = false } = {}) {
  const row = db.prepare(`${SELECT} WHERE n.id = ?`).get(id);
  if (!row || (!row.published && !includeDrafts)) return null;
  return row;
}

export function createNews({ title, summary, content, published, authorId }) {
  const result = db
    .prepare('INSERT INTO news (title, summary, content, published, author_id) VALUES (?, ?, ?, ?, ?)')
    .run(title, summary || null, content, published ? 1 : 0, authorId ?? null);
  return Number(result.lastInsertRowid);
}

export function updateNews(id, { title, summary, content, published }) {
  const result = db
    .prepare(
      `UPDATE news
          SET title = ?, summary = ?, content = ?, published = ?, updated_at = datetime('now')
        WHERE id = ?`,
    )
    .run(title, summary || null, content, published ? 1 : 0, id);
  return result.changes > 0;
}

export function deleteNews(id) {
  return db.prepare('DELETE FROM news WHERE id = ?').run(id).changes > 0;
}