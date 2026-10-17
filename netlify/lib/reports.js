const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, listKeys } = require('./store');

function newId() {
  return crypto.randomBytes(10).toString('hex');
}

async function createReport({ reporterEmail, targetType, targetId, reason, detail, snapshot }) {
  const keys = await listKeys(STORE_NAMES.ADMIN_AUDIT, 'report:');
  for (const key of keys) {
    const previous = await getJSON(STORE_NAMES.ADMIN_AUDIT, key);
    if (previous && previous.kind === 'report' && previous.reporterEmail === reporterEmail && previous.targetType === targetType && previous.targetId === targetId && previous.status !== 'dismissed') {
      return { duplicate: true, report: previous };
    }
  }

  const report = {
    kind: 'report',
    id: newId(),
    reporterEmail,
    targetType,
    targetId: String(targetId || '').slice(0, 180),
    reason: String(reason || 'その他').slice(0, 80),
    detail: String(detail || '').trim().slice(0, 1000),
    snapshot: snapshot || null,
    status: 'open',
    createdAt: new Date().toISOString()
  };
  await setJSON(STORE_NAMES.ADMIN_AUDIT, `report:${report.id}`, report);
  return { duplicate: false, report };
}

module.exports = { createReport };

