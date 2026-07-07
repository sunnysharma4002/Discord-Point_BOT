const { Pool } = require('pg');

let pool;
let initPromise;

function parseInteger(value, fallback, { min = 0 } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return parsed;
}

function getDefaultSettings() {
  return {
    claimCost: parseInteger(process.env.CLAIM_COST, 10, { min: 1 }),
    rewardIntervalMinutes: parseInteger(process.env.VC_REWARD_INTERVAL_MINUTES, 5, { min: 1 }),
    rewardAmount: parseInteger(process.env.VC_REWARD_AMOUNT, 1, { min: 1 }),
    liveBonusAmount: parseInteger(process.env.LIVE_BONUS_AMOUNT, 1, { min: 0 }),
    dailyBonusAmount: parseInteger(process.env.DAILY_BONUS_AMOUNT, 5, { min: 0 })
  };
}

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required for database operations.');
    }

    const isLocal = /localhost|127\.0\.0\.1/i.test(process.env.DATABASE_URL);
    const ssl = process.env.PGSSL === 'false' || isLocal
      ? false
      : { rejectUnauthorized: false };

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl
    });

    pool.on('error', (error) => {
      console.error('[database] Unexpected idle client error:', error);
    });
  }

  return pool;
}

async function initDatabase() {
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const db = getPool();

    await db.query(`
      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        reward_interval_minutes INTEGER NOT NULL DEFAULT 5 CHECK (reward_interval_minutes > 0),
        reward_amount INTEGER NOT NULL DEFAULT 1 CHECK (reward_amount > 0),
        live_bonus_amount INTEGER NOT NULL DEFAULT 1 CHECK (live_bonus_amount >= 0),
        claim_cost INTEGER NOT NULL DEFAULT 10 CHECK (claim_cost > 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        coins INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
        total_vc_seconds BIGINT NOT NULL DEFAULT 0,
        total_live_seconds BIGINT NOT NULL DEFAULT 0,
        daily_last_claim DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, user_id)
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS keys (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        key_value TEXT NOT NULL,
        claimed_by TEXT,
        claimed_at TIMESTAMPTZ,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (guild_id, key_value)
      );
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_keys_available
      ON keys (guild_id, id)
      WHERE claimed_by IS NULL;
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS coin_transactions (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        amount INTEGER NOT NULL,
        reason TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_coin_transactions_user
      ON coin_transactions (guild_id, user_id, created_at DESC);
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS voice_sessions (
        id BIGSERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        channel_id TEXT,
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ NOT NULL,
        seconds INTEGER NOT NULL DEFAULT 0,
        live_seconds INTEGER NOT NULL DEFAULT 0,
        coins_awarded INTEGER NOT NULL DEFAULT 0,
        metadata JSONB NOT NULL DEFAULT '{}'::JSONB
      );
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_voice_sessions_user
      ON voice_sessions (guild_id, user_id, started_at DESC);
    `);
  })();

  return initPromise;
}

function normalizeUser(row) {
  if (!row) {
    return null;
  }

  return {
    guildId: row.guild_id,
    userId: row.user_id,
    coins: Number(row.coins || 0),
    totalVcSeconds: Number(row.total_vc_seconds || 0),
    totalLiveSeconds: Number(row.total_live_seconds || 0),
    dailyLastClaim: row.daily_last_claim || null,
    updatedAt: row.updated_at || null
  };
}

function normalizeSettings(row) {
  return {
    guildId: row.guild_id,
    rewardIntervalMinutes: Number(row.reward_interval_minutes),
    rewardAmount: Number(row.reward_amount),
    liveBonusAmount: Number(row.live_bonus_amount),
    claimCost: Number(row.claim_cost)
  };
}

async function ensureGuildSettings(guildId, client = getPool()) {
  const defaults = getDefaultSettings();
  await client.query(
    `
      INSERT INTO guild_settings (
        guild_id,
        reward_interval_minutes,
        reward_amount,
        live_bonus_amount,
        claim_cost
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (guild_id) DO NOTHING;
    `,
    [
      guildId,
      defaults.rewardIntervalMinutes,
      defaults.rewardAmount,
      defaults.liveBonusAmount,
      defaults.claimCost
    ]
  );
}

async function ensureUser(guildId, userId, client = getPool()) {
  await client.query(
    `
      INSERT INTO users (guild_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (guild_id, user_id) DO NOTHING;
    `,
    [guildId, userId]
  );
}

async function getSettings(guildId) {
  await initDatabase();
  await ensureGuildSettings(guildId);

  const result = await getPool().query(
    'SELECT * FROM guild_settings WHERE guild_id = $1;',
    [guildId]
  );

  return normalizeSettings(result.rows[0]);
}

async function updateSettings(guildId, patch) {
  await initDatabase();
  await ensureGuildSettings(guildId);

  const allowed = {
    rewardIntervalMinutes: 'reward_interval_minutes',
    rewardAmount: 'reward_amount',
    liveBonusAmount: 'live_bonus_amount',
    claimCost: 'claim_cost'
  };

  const entries = Object.entries(patch)
    .filter(([key, value]) => allowed[key] && value !== undefined && value !== null);

  if (entries.length === 0) {
    return getSettings(guildId);
  }

  const assignments = entries.map(([key], index) => `${allowed[key]} = $${index + 2}`);
  const values = entries.map(([, value]) => Number(value));

  const result = await getPool().query(
    `
      UPDATE guild_settings
      SET ${assignments.join(', ')}, updated_at = NOW()
      WHERE guild_id = $1
      RETURNING *;
    `,
    [guildId, ...values]
  );

  return normalizeSettings(result.rows[0]);
}

async function getUser(guildId, userId) {
  await initDatabase();
  await ensureUser(guildId, userId);

  const result = await getPool().query(
    'SELECT * FROM users WHERE guild_id = $1 AND user_id = $2;',
    [guildId, userId]
  );

  return normalizeUser(result.rows[0]);
}

async function addCoins(guildId, userId, amount, reason, metadata = {}) {
  await initDatabase();

  const delta = Number.parseInt(amount, 10);
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error('Coin amount must be a non-zero integer.');
  }

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    await ensureUser(guildId, userId, client);

    const result = await client.query(
      `
        UPDATE users
        SET coins = GREATEST(coins + $3, 0), updated_at = NOW()
        WHERE guild_id = $1 AND user_id = $2
        RETURNING *;
      `,
      [guildId, userId, delta]
    );

    await client.query(
      `
        INSERT INTO coin_transactions (guild_id, user_id, amount, reason, metadata)
        VALUES ($1, $2, $3, $4, $5::JSONB);
      `,
      [guildId, userId, delta, reason, JSON.stringify(metadata)]
    );

    await client.query('COMMIT');
    return normalizeUser(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function removeCoins(guildId, userId, amount, reason = 'admin_remove', metadata = {}) {
  const value = Number.parseInt(amount, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Amount must be greater than 0.');
  }

  return addCoins(guildId, userId, -value, reason, metadata);
}

async function setCoins(guildId, userId, coins, reason = 'admin_set', metadata = {}) {
  await initDatabase();

  const nextCoins = Math.max(0, Number.parseInt(coins, 10));
  if (!Number.isFinite(nextCoins)) {
    throw new Error('Coin amount must be a valid integer.');
  }

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    await ensureUser(guildId, userId, client);

    const before = await client.query(
      'SELECT coins FROM users WHERE guild_id = $1 AND user_id = $2 FOR UPDATE;',
      [guildId, userId]
    );
    const previousCoins = Number(before.rows[0].coins);

    const result = await client.query(
      `
        UPDATE users
        SET coins = $3, updated_at = NOW()
        WHERE guild_id = $1 AND user_id = $2
        RETURNING *;
      `,
      [guildId, userId, nextCoins]
    );

    await client.query(
      `
        INSERT INTO coin_transactions (guild_id, user_id, amount, reason, metadata)
        VALUES ($1, $2, $3, $4, $5::JSONB);
      `,
      [
        guildId,
        userId,
        nextCoins - previousCoins,
        reason,
        JSON.stringify(metadata)
      ]
    );

    await client.query('COMMIT');
    return normalizeUser(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getLeaderboard(guildId, limit = 10) {
  await initDatabase();

  const result = await getPool().query(
    `
      SELECT *
      FROM users
      WHERE guild_id = $1
      ORDER BY coins DESC, total_vc_seconds DESC, user_id ASC
      LIMIT $2;
    `,
    [guildId, limit]
  );

  return result.rows.map(normalizeUser);
}

async function addKey(guildId, keyValue, createdBy) {
  await initDatabase();

  const trimmedKey = String(keyValue || '').trim();
  if (!trimmedKey) {
    throw new Error('Key cannot be empty.');
  }

  const result = await getPool().query(
    `
      INSERT INTO keys (guild_id, key_value, created_by)
      VALUES ($1, $2, $3)
      ON CONFLICT (guild_id, key_value) DO NOTHING
      RETURNING id;
    `,
    [guildId, trimmedKey, createdBy]
  );

  return {
    added: result.rowCount === 1,
    id: result.rows[0]?.id ? Number(result.rows[0].id) : null
  };
}

async function claimKey(guildId, userId, cost) {
  await initDatabase();

  const claimCost = Number.parseInt(cost, 10);
  if (!Number.isFinite(claimCost) || claimCost <= 0) {
    throw new Error('Claim cost must be greater than 0.');
  }

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    await ensureUser(guildId, userId, client);

    const userResult = await client.query(
      'SELECT * FROM users WHERE guild_id = $1 AND user_id = $2 FOR UPDATE;',
      [guildId, userId]
    );
    const user = userResult.rows[0];

    if (Number(user.coins) < claimCost) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        reason: 'INSUFFICIENT_COINS',
        balance: Number(user.coins),
        cost: claimCost
      };
    }

    const keyResult = await client.query(
      `
        SELECT id, key_value
        FROM keys
        WHERE guild_id = $1 AND claimed_by IS NULL
        ORDER BY id ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;
      `,
      [guildId]
    );

    if (keyResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        reason: 'NO_KEYS',
        balance: Number(user.coins),
        cost: claimCost
      };
    }

    const key = keyResult.rows[0];

    const updatedUser = await client.query(
      `
        UPDATE users
        SET coins = coins - $3, updated_at = NOW()
        WHERE guild_id = $1 AND user_id = $2
        RETURNING *;
      `,
      [guildId, userId, claimCost]
    );

    await client.query(
      `
        UPDATE keys
        SET claimed_by = $2, claimed_at = NOW()
        WHERE id = $1;
      `,
      [key.id, userId]
    );

    await client.query(
      `
        INSERT INTO coin_transactions (guild_id, user_id, amount, reason, metadata)
        VALUES ($1, $2, $3, $4, $5::JSONB);
      `,
      [
        guildId,
        userId,
        -claimCost,
        'claim_key',
        JSON.stringify({ keyId: Number(key.id) })
      ]
    );

    await client.query('COMMIT');

    return {
      ok: true,
      keyId: Number(key.id),
      keyValue: key.key_value,
      balance: Number(updatedUser.rows[0].coins),
      cost: claimCost
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function revertClaim(guildId, userId, keyId, cost) {
  await initDatabase();

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');

    const keyResult = await client.query(
      `
        UPDATE keys
        SET claimed_by = NULL, claimed_at = NULL
        WHERE guild_id = $1 AND id = $2 AND claimed_by = $3
        RETURNING id;
      `,
      [guildId, keyId, userId]
    );

    if (keyResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return false;
    }

    await ensureUser(guildId, userId, client);

    await client.query(
      `
        UPDATE users
        SET coins = coins + $3, updated_at = NOW()
        WHERE guild_id = $1 AND user_id = $2;
      `,
      [guildId, userId, Number(cost)]
    );

    await client.query(
      `
        INSERT INTO coin_transactions (guild_id, user_id, amount, reason, metadata)
        VALUES ($1, $2, $3, $4, $5::JSONB);
      `,
      [
        guildId,
        userId,
        Number(cost),
        'claim_refund',
        JSON.stringify({ keyId: Number(keyId), reason: 'dm_failed' })
      ]
    );

    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function claimDaily(guildId, userId, amount) {
  await initDatabase();

  const dailyAmount = Number.parseInt(amount, 10);
  if (!Number.isFinite(dailyAmount) || dailyAmount < 0) {
    throw new Error('Daily amount must be 0 or greater.');
  }

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    await ensureUser(guildId, userId, client);

    const userResult = await client.query(
      `
        SELECT *, daily_last_claim = CURRENT_DATE AS claimed_today
        FROM users
        WHERE guild_id = $1 AND user_id = $2
        FOR UPDATE;
      `,
      [guildId, userId]
    );

    if (userResult.rows[0].claimed_today) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        reason: 'ALREADY_CLAIMED',
        user: normalizeUser(userResult.rows[0])
      };
    }

    const updatedUser = await client.query(
      `
        UPDATE users
        SET coins = coins + $3, daily_last_claim = CURRENT_DATE, updated_at = NOW()
        WHERE guild_id = $1 AND user_id = $2
        RETURNING *;
      `,
      [guildId, userId, dailyAmount]
    );

    if (dailyAmount > 0) {
      await client.query(
        `
          INSERT INTO coin_transactions (guild_id, user_id, amount, reason, metadata)
          VALUES ($1, $2, $3, $4, $5::JSONB);
        `,
        [guildId, userId, dailyAmount, 'daily_bonus', JSON.stringify({})]
      );
    }

    await client.query('COMMIT');
    return {
      ok: true,
      amount: dailyAmount,
      user: normalizeUser(updatedUser.rows[0])
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function recordVoiceSession({
  guildId,
  userId,
  channelId,
  startedAt,
  endedAt,
  seconds,
  liveSeconds,
  coinsAwarded,
  metadata = {}
}) {
  await initDatabase();

  const client = await getPool().connect();

  try {
    await client.query('BEGIN');
    await ensureUser(guildId, userId, client);

    await client.query(
      `
        UPDATE users
        SET
          total_vc_seconds = total_vc_seconds + $3,
          total_live_seconds = total_live_seconds + $4,
          updated_at = NOW()
        WHERE guild_id = $1 AND user_id = $2;
      `,
      [guildId, userId, Number(seconds), Number(liveSeconds)]
    );

    await client.query(
      `
        INSERT INTO voice_sessions (
          guild_id,
          user_id,
          channel_id,
          started_at,
          ended_at,
          seconds,
          live_seconds,
          coins_awarded,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::JSONB);
      `,
      [
        guildId,
        userId,
        channelId,
        startedAt,
        endedAt,
        Number(seconds),
        Number(liveSeconds),
        Number(coinsAwarded),
        JSON.stringify(metadata)
      ]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getStats(guildId) {
  await initDatabase();
  await ensureGuildSettings(guildId);

  const [userStats, keyStats, transactionStats, sessionStats] = await Promise.all([
    getPool().query(
      `
        SELECT
          COUNT(*)::INTEGER AS user_count,
          COALESCE(SUM(coins), 0)::BIGINT AS total_coins,
          COALESCE(SUM(total_vc_seconds), 0)::BIGINT AS total_vc_seconds,
          COALESCE(SUM(total_live_seconds), 0)::BIGINT AS total_live_seconds
        FROM users
        WHERE guild_id = $1;
      `,
      [guildId]
    ),
    getPool().query(
      `
        SELECT
          COUNT(*)::INTEGER AS total_keys,
          COUNT(*) FILTER (WHERE claimed_by IS NULL)::INTEGER AS available_keys,
          COUNT(*) FILTER (WHERE claimed_by IS NOT NULL)::INTEGER AS claimed_keys
        FROM keys
        WHERE guild_id = $1;
      `,
      [guildId]
    ),
    getPool().query(
      `
        SELECT COUNT(*)::INTEGER AS transaction_count
        FROM coin_transactions
        WHERE guild_id = $1;
      `,
      [guildId]
    ),
    getPool().query(
      `
        SELECT COUNT(*)::INTEGER AS voice_session_count
        FROM voice_sessions
        WHERE guild_id = $1;
      `,
      [guildId]
    )
  ]);

  return {
    users: Number(userStats.rows[0].user_count || 0),
    totalCoins: Number(userStats.rows[0].total_coins || 0),
    totalVcSeconds: Number(userStats.rows[0].total_vc_seconds || 0),
    totalLiveSeconds: Number(userStats.rows[0].total_live_seconds || 0),
    totalKeys: Number(keyStats.rows[0].total_keys || 0),
    availableKeys: Number(keyStats.rows[0].available_keys || 0),
    claimedKeys: Number(keyStats.rows[0].claimed_keys || 0),
    transactions: Number(transactionStats.rows[0].transaction_count || 0),
    voiceSessions: Number(sessionStats.rows[0].voice_session_count || 0)
  };
}

async function healthCheck() {
  await initDatabase();
  await getPool().query('SELECT 1;');
  return { ok: true };
}

async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    initPromise = null;
  }
}

module.exports = {
  addCoins,
  addKey,
  claimDaily,
  claimKey,
  closeDatabase,
  getDefaultSettings,
  getLeaderboard,
  getSettings,
  getStats,
  getUser,
  healthCheck,
  initDatabase,
  recordVoiceSession,
  removeCoins,
  revertClaim,
  setCoins,
  updateSettings
};
