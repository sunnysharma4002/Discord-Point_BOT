require('dotenv').config();

const database = require('../src/utils/database');

module.exports = async function health(req, res) {
  try {
    await database.healthCheck();
    res.status(200).json({
      ok: true,
      service: 'discord-vc-coin-bot-api'
    });
  } catch (error) {
    console.error('[api/health] Failed:', error);
    res.status(500).json({
      ok: false,
      error: 'Database health check failed.'
    });
  }
};
