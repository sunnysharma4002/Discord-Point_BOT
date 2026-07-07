require('dotenv').config();

const database = require('../src/utils/database');

function isAuthorized(req) {
  if (!process.env.API_SECRET) {
    return true;
  }

  return req.headers.authorization === `Bearer ${process.env.API_SECRET}`;
}

module.exports = async function stats(req, res) {
  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'Unauthorized.' });
    return;
  }

  const guildId = req.query.guildId || process.env.GUILD_ID;
  if (!guildId) {
    res.status(400).json({
      ok: false,
      error: 'Provide ?guildId=... or set GUILD_ID.'
    });
    return;
  }

  try {
    const [botStats, settings] = await Promise.all([
      database.getStats(guildId),
      database.getSettings(guildId)
    ]);

    res.status(200).json({
      ok: true,
      guildId,
      stats: botStats,
      settings
    });
  } catch (error) {
    console.error('[api/stats] Failed:', error);
    res.status(500).json({
      ok: false,
      error: 'Could not load stats.'
    });
  }
};
