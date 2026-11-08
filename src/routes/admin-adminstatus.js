import { loadServerGroups } from '../ts3/groups.js';
import { ADMIN_STATUS_CACHE } from '../ts3/admin-status.js';
import { getSetting, setSetting } from '../services/settings.js';
import { clearCache } from '../cache.js';
import { toId } from '../utils/helpers.js';

/** Normale Server-Gruppen in TS-Sortierung, oder null wenn der Server offline ist. */
async function loadSelectableGroups() {
  try {
    const groups = await loadServerGroups();
    return [...groups.values()]
      .filter((group) => group.type === 1)
      .sort((a, b) => a.sortId - b.sortId || a.id - b.id);
  } catch {
    return null;
  }
}

function formData(groups, saved) {
  return {
    title: 'Admin-Status',
    online: groups !== null,
    groups: groups ?? [],
    selected: getSetting('adminstatus_groups', []),
    hideOffline: getSetting('adminstatus_hide_offline', false),
    saved,
  };
}

export default async function adminStatusRoutes(app) {
  app.get('/', async (request, reply) => {
    const groups = await loadSelectableGroups();
    return reply.render('./admin/adminstatus', formData(groups, request.query.saved === '1'));
  });

  app.post('/', async (request, reply) => {
    const groups = await loadSelectableGroups();
    if (!groups) return reply.code(503).render('./admin/adminstatus', formData(null, false));

    const allowed = new Set(groups.map((group) => group.id));
    const selected = [].concat(request.body?.groups ?? [])
      .map((value) => toId(value))
      .filter((id) => id !== null && allowed.has(id));

    setSetting('adminstatus_groups', selected);
    setSetting('adminstatus_hide_offline', request.body?.hideOffline === '1');
    clearCache(ADMIN_STATUS_CACHE);

    return reply.redirect('/admin/adminstatus?saved=1', 303);
  });
}