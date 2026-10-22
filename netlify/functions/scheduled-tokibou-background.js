// 時報botの定期実行。毎分起動し、参加者がオフラインでも予定時刻の投稿を保存する。
// 後からスレッドを開いた参加者にも、無人中のbot投稿が表示される。

const crypto = require('crypto');
const { STORE_NAMES, getJSON, setJSON, listKeys } = require('../lib/store');

function newId() {
  return crypto.randomBytes(8).toString('hex');
}

const TOKYO_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone:'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit',
  weekday:'short', hour:'2-digit', minute:'2-digit', hourCycle:'h23'
});

function tokyoParts(date) {
  return Object.fromEntries(TOKYO_DATE_FORMATTER.formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
}

function matchesDay(bot, parts) {
  const dayMap = { Sun:'sun', Mon:'mon', Tue:'tue', Wed:'wed', Thu:'thu', Fri:'fri', Sat:'sat' };
  const today = dayMap[parts.weekday];
  if (!bot.days || bot.days.length === 0) return true;
  if (bot.days.includes('everyday')) return true;
  if (bot.days.includes('weekday')) return today !== 'sun' && today !== 'sat';
  return bot.days.includes(today);
}

function matchesOnceDate(bot, parts) {
  if (!bot.dateOnce) return true;
  const { year, month, day } = bot.dateOnce;
  return Number(year) === Number(parts.year) && Number(month) === Number(parts.month) && Number(day) === Number(parts.day);
}

function scheduledSlots(bot, from, to) {
  const slots = [];
  const times = Array.isArray(bot.times) ? bot.times : [];
  if (!times.length) return slots;
  const start = new Date(from);
  start.setUTCSeconds(0, 0);
  const end = new Date(to);
  end.setUTCSeconds(0, 0);
  const cursor = new Date(start);
  const maxMinutes = 14 * 24 * 60;
  let visited = 0;
  while (cursor <= end && visited++ <= maxMinutes) {
    const parts = tokyoParts(cursor);
    if (matchesDay(bot, parts) && matchesOnceDate(bot, parts)) {
      const hhmm = `${parts.hour}:${parts.minute}`;
      if (times.includes(hhmm)) slots.push(new Date(cursor));
    }
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return slots;
}

// 次に投稿すべき時刻（最大7日先まで）。時報botが無ければ null
function nextSlotAt(bots, now) {
  let best = null;
  const from = new Date(now.getTime() + 60 * 1000);
  const to = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  for (const bot of bots) {
    if (bot.triggerType !== 'routine' || !Array.isArray(bot.times) || !bot.times.length) continue;
    const slot = firstSlot(bot, from, to);
    if (slot && (!best || slot < best)) best = slot;
  }
  return best;
}

function firstSlot(bot, from, to) {
  const cursor = new Date(from);
  cursor.setUTCSeconds(0, 0);
  while (cursor <= to) {
    const parts = tokyoParts(cursor);
    if (matchesDay(bot, parts) && matchesOnceDate(bot, parts) && bot.times.includes(`${parts.hour}:${parts.minute}`)) return cursor.getTime();
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1);
  }
  return null;
}

exports.handler = async (event) => {
  const now = new Date();
  const allBots = [];
  try { return await run(now, allBots); }
  finally {
    // 予約投稿の次の公開時刻もあわせて、いちばん早い予定まで定期実行を止める（最長6時間ごとには確認）
    let next = nextSlotAt(allBots, now);
    try { const at = await require('../../server/plus2').nextScheduledAt(); if (at && (!next || at < next)) next = at; } catch (_) {}
    const cap = now.getTime() + 6 * 60 * 60 * 1000;
    await require('../../server/cron-gate').sleepUntil('scheduled-tokibou-background', Math.min(next || cap, cap) - 30 * 1000, now.getTime());
  }
};

async function run(now, allBots) {
  const threadIds = await listKeys(STORE_NAMES.UCH_BOTS);

  for (const threadId of threadIds) {
    const bots = (await getJSON(STORE_NAMES.UCH_BOTS, threadId)) || [];
    allBots.push(...bots);
    const routineBots = bots.filter((bot) => bot.triggerType === 'routine');
    if (routineBots.length === 0) continue;

    const thread = await getJSON(STORE_NAMES.UCH_THREADS, threadId);
    if (!thread) continue;

    let threadChanged = false;
    for (const bot of routineBots) {
      const lastProcessed = bot.lastProcessedAt ? new Date(bot.lastProcessedAt) : new Date(now.getTime() - 60 * 1000);
      const slots = scheduledSlots(bot, new Date(lastProcessed.getTime() + 60 * 1000), now);
      if (slots.length === 0) {
        bot.lastProcessedAt = now.toISOString();
        threadChanged = true;
        continue;
      }

      for (const scheduledAt of slots) {
        thread.posts.push({
          id: newId(),
          author: bot.name,
          botIcon: bot.icon || '?',
          text: bot.message || '',
          createdAt: scheduledAt.toISOString(),
          deliveredAt: now.toISOString(),
          scheduledAt: scheduledAt.toISOString(),
          isCatchUp: scheduledAt.getTime() < now.getTime() - 60 * 1000,
          isBot: true
        });
      }
      bot.lastProcessedAt = now.toISOString();
      threadChanged = true;
    }

    if (threadChanged) {
      await setJSON(STORE_NAMES.UCH_THREADS, threadId, thread);
      await setJSON(STORE_NAMES.UCH_BOTS, threadId, bots);
    }
  }

  return { statusCode: 200, body: 'ok' };
}
