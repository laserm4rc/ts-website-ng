import { db, transaction } from '../db/index.js';

export function listFaq() {
  return db.prepare('SELECT id, question, answer, sort_order FROM faq ORDER BY sort_order, id').all();
}

export function getFaq(id) {
  return db.prepare('SELECT id, question, answer, sort_order FROM faq WHERE id = ?').get(id) ?? null;
}

/** Neue Einträge landen automatisch ganz unten. */
export function createFaq({ question, answer }) {
  const result = db
    .prepare(
      `INSERT INTO faq (question, answer, sort_order)
       VALUES (?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM faq))`,
    )
    .run(question, answer);
  return Number(result.lastInsertRowid);
}

export function updateFaq(id, { question, answer }) {
  return db.prepare('UPDATE faq SET question = ?, answer = ? WHERE id = ?').run(question, answer, id).changes > 0;
}

export function deleteFaq(id) {
  return db.prepare('DELETE FROM faq WHERE id = ?').run(id).changes > 0;
}

/** Tauscht einen Eintrag mit seinem Nachbarn und nummeriert die Liste sauber neu. */
export function moveFaq(id, direction) {
  transaction(() => {
    const items = listFaq();
    const index = items.findIndex((item) => item.id === id);
    const target = index + (direction === 'up' ? -1 : 1);
    if (index === -1 || target < 0 || target >= items.length) return;

    [items[index], items[target]] = [items[target], items[index]];

    const update = db.prepare('UPDATE faq SET sort_order = ? WHERE id = ?');
    items.forEach((item, position) => update.run(position, item.id));
  });
}