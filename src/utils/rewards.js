const database = require('./database');

const REWARD_TICK_MS = 30_000;
const SETTINGS_CACHE_MS = 60_000;

const activeSessions = new Map();
const settingsCache = new Map();
let rewardTimer;
let rewardProcessorRunning = false;

function getSessionKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = Math.floor(safeSeconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${remainingSeconds}s`;
}

function formatReason(reason) {
  const labels = {
    afk_channel: 'AFK channel',
    alone: 'alone in VC',
    eligible: 'earning',
    muted_or_deafened: 'muted or deafened',
    not_connected: 'not connected',
    starting: 'starting'
  };

  return labels[reason] || String(reason || 'unknown').replaceAll('_', ' ');
}

function getReasonFix(reason) {
  const fixes = {
    afk_channel: 'Move out of the server AFK channel.',
    alone: 'Join with at least one other real user.',
    muted_or_deafened: 'Unmute and undeafen yourself, then wait for the next voice update.',
    not_connected: 'Join a voice channel to start tracking.',
    starting: 'Wait a few seconds for the session to initialize.'
  };

  return fixes[reason] || 'Check your voice state and try again.';
}

async function getCachedSettings(guildId) {
  const cached = settingsCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const settings = await database.getSettings(guildId);
  settingsCache.set(guildId, {
    value: settings,
    expiresAt: Date.now() + SETTINGS_CACHE_MS
  });

  return settings;
}

function clearSettingsCache(guildId) {
  if (guildId) {
    settingsCache.delete(guildId);
    return;
  }

  settingsCache.clear();
}

function getEligibilityDetails(voiceState) {
  if (!voiceState?.channel || !voiceState?.member || voiceState.member.user.bot) {
    return {
      eligible: false,
      live: false,
      reason: 'not_connected'
    };
  }

  if (voiceState.guild.afkChannelId && voiceState.channelId === voiceState.guild.afkChannelId) {
    return {
      eligible: false,
      live: false,
      reason: 'afk_channel'
    };
  }

  if (
    voiceState.selfMute ||
    voiceState.serverMute ||
    voiceState.selfDeaf ||
    voiceState.serverDeaf ||
    voiceState.suppress
  ) {
    return {
      eligible: false,
      live: false,
      reason: 'muted_or_deafened'
    };
  }

  const humanMembers = voiceState.channel.members.filter((member) => {
    return !member.user.bot && member.voice.channelId === voiceState.channelId;
  });

  if (humanMembers.size < 2) {
    return {
      eligible: false,
      live: false,
      reason: 'alone'
    };
  }

  return {
    eligible: true,
    live: Boolean(voiceState.streaming),
    reason: 'eligible'
  };
}

function updateSessionState(session, voiceState) {
  const details = getEligibilityDetails(voiceState);
  session.channelId = voiceState.channelId || session.channelId;
  session.eligible = details.eligible;
  session.live = details.live;
  session.lastIneligibilityReason = details.reason;
}

async function applyElapsed(session, now = Date.now()) {
  const elapsedSeconds = Math.floor((now - session.lastTickAt) / 1000);
  if (elapsedSeconds <= 0) {
    return;
  }

  session.lastTickAt = now;
  session.totalSeconds += elapsedSeconds;

  if (session.eligible) {
    session.pendingBaseSeconds += elapsedSeconds;
  }

  if (session.live) {
    session.pendingLiveSeconds += elapsedSeconds;
    session.totalLiveSeconds += elapsedSeconds;
  }

  if (!session.eligible && !session.live) {
    return;
  }

  const settings = await getCachedSettings(session.guildId);
  const intervalSeconds = Math.max(60, settings.rewardIntervalMinutes * 60);
  const basePayouts = Math.floor(session.pendingBaseSeconds / intervalSeconds);
  const livePayouts = Math.floor(session.pendingLiveSeconds / intervalSeconds);
  const coinsToAward =
    basePayouts * settings.rewardAmount +
    livePayouts * settings.liveBonusAmount;

  if (basePayouts > 0) {
    session.pendingBaseSeconds -= basePayouts * intervalSeconds;
  }

  if (livePayouts > 0) {
    session.pendingLiveSeconds -= livePayouts * intervalSeconds;
  }

  if (coinsToAward <= 0) {
    return;
  }

  session.coinsAwarded += coinsToAward;

  await database.addCoins(
    session.guildId,
    session.userId,
    coinsToAward,
    'voice_reward',
    {
      baseIntervals: basePayouts,
      liveIntervals: livePayouts,
      channelId: session.channelId
    }
  );
}

function createSession(voiceState, now = Date.now()) {
  const session = {
    guildId: voiceState.guild.id,
    userId: voiceState.id,
    channelId: voiceState.channelId,
    startedAt: new Date(now),
    lastTickAt: now,
    eligible: false,
    live: false,
    lastIneligibilityReason: 'starting',
    totalSeconds: 0,
    totalLiveSeconds: 0,
    pendingBaseSeconds: 0,
    pendingLiveSeconds: 0,
    coinsAwarded: 0
  };

  updateSessionState(session, voiceState);
  activeSessions.set(getSessionKey(session.guildId, session.userId), session);
  return session;
}

async function refreshChannelSessions(channel, now = Date.now()) {
  if (!channel?.isVoiceBased?.()) {
    return;
  }

  for (const member of channel.members.values()) {
    if (member.user.bot) {
      continue;
    }

    const session = activeSessions.get(getSessionKey(member.guild.id, member.id));
    if (!session) {
      continue;
    }

    await applyElapsed(session, now);
    updateSessionState(session, member.voice);
  }
}

async function finishSession(session, now = Date.now()) {
  await applyElapsed(session, now);
  activeSessions.delete(getSessionKey(session.guildId, session.userId));

  await database.recordVoiceSession({
    guildId: session.guildId,
    userId: session.userId,
    channelId: session.channelId,
    startedAt: session.startedAt,
    endedAt: new Date(now),
    seconds: session.totalSeconds,
    liveSeconds: session.totalLiveSeconds,
    coinsAwarded: session.coinsAwarded,
    metadata: {
      lastIneligibilityReason: session.lastIneligibilityReason
    }
  });
}

async function handleVoiceStateUpdate(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot || !newState.guild) {
    return;
  }

  const key = getSessionKey(newState.guild.id, member.id);
  const existing = activeSessions.get(key);
  const wasConnected = Boolean(oldState.channelId);
  const isConnected = Boolean(newState.channelId);
  const now = Date.now();

  if (!wasConnected && isConnected) {
    createSession(newState, now);
    await refreshChannelSessions(newState.channel, now);
    return;
  }

  if (wasConnected && !isConnected) {
    if (existing) {
      await finishSession(existing, now);
    }

    await refreshChannelSessions(oldState.channel, now);
    return;
  }

  if (isConnected) {
    const session = existing || createSession(newState, now);
    await applyElapsed(session, now);
    updateSessionState(session, newState);

    if (oldState.channelId !== newState.channelId) {
      await refreshChannelSessions(oldState.channel, now);
    }

    await refreshChannelSessions(newState.channel, now);
  }
}

async function processActiveSessions(client) {
  const now = Date.now();

  for (const session of activeSessions.values()) {
    try {
      const guild = client.guilds.cache.get(session.guildId);
      const member = guild?.members.cache.get(session.userId);

      if (!guild || !member || !member.voice.channelId) {
        await finishSession(session, now);
        continue;
      }

      await applyElapsed(session, now);
      updateSessionState(session, member.voice);
    } catch (error) {
      console.error(
        `[rewards] Failed to process session ${session.guildId}/${session.userId}:`,
        error
      );
    }
  }
}

function startRewardProcessor(client) {
  if (rewardTimer) {
    return;
  }

  rewardTimer = setInterval(() => {
    if (rewardProcessorRunning) {
      return;
    }

    rewardProcessorRunning = true;
    processActiveSessions(client)
      .catch((error) => {
        console.error('[rewards] Reward processor failed:', error);
      })
      .finally(() => {
        rewardProcessorRunning = false;
      });
  }, REWARD_TICK_MS);

  rewardTimer.unref?.();
}

function stopRewardProcessor() {
  if (rewardTimer) {
    clearInterval(rewardTimer);
    rewardTimer = undefined;
  }
}

function bootstrapExistingVoiceSessions(client) {
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isVoiceBased?.()) {
        continue;
      }

      for (const member of channel.members.values()) {
        if (member.user.bot) {
          continue;
        }

        const key = getSessionKey(guild.id, member.id);
        if (!activeSessions.has(key)) {
          createSession(member.voice, now);
        }
      }
    }
  }
}

function getActiveSessionCount(guildId) {
  if (!guildId) {
    return activeSessions.size;
  }

  return Array.from(activeSessions.values())
    .filter((session) => session.guildId === guildId)
    .length;
}

function getActiveSessionsSnapshot(guildId) {
  return Array.from(activeSessions.values())
    .filter((session) => !guildId || session.guildId === guildId)
    .map((session) => ({
      guildId: session.guildId,
      userId: session.userId,
      channelId: session.channelId,
      eligible: session.eligible,
      live: session.live,
      totalSeconds: session.totalSeconds,
      totalLiveSeconds: session.totalLiveSeconds,
      coinsAwarded: session.coinsAwarded,
      duration: formatDuration(Math.floor((Date.now() - session.startedAt.getTime()) / 1000)),
      lastIneligibilityReason: session.lastIneligibilityReason
    }));
}

function getActiveSessionForUser(guildId, userId) {
  const session = activeSessions.get(getSessionKey(guildId, userId));
  if (!session) {
    return null;
  }

  const elapsedSinceLastTick = Math.max(0, Math.floor((Date.now() - session.lastTickAt) / 1000));
  const totalSeconds = session.totalSeconds + elapsedSinceLastTick;
  const totalLiveSeconds = session.totalLiveSeconds + (session.live ? elapsedSinceLastTick : 0);
  const pendingBaseSeconds = session.pendingBaseSeconds + (session.eligible ? elapsedSinceLastTick : 0);
  const pendingLiveSeconds = session.pendingLiveSeconds + (session.live ? elapsedSinceLastTick : 0);
  const connectedSeconds = Math.max(0, Math.floor((Date.now() - session.startedAt.getTime()) / 1000));

  return {
    guildId: session.guildId,
    userId: session.userId,
    channelId: session.channelId,
    connectedSeconds,
    eligible: session.eligible,
    live: session.live,
    totalSeconds,
    totalLiveSeconds,
    pendingBaseSeconds,
    pendingLiveSeconds,
    coinsAwarded: session.coinsAwarded,
    duration: formatDuration(totalSeconds),
    lastIneligibilityReason: session.lastIneligibilityReason,
    reasonLabel: formatReason(session.lastIneligibilityReason),
    reasonFix: getReasonFix(session.lastIneligibilityReason)
  };
}

module.exports = {
  bootstrapExistingVoiceSessions,
  clearSettingsCache,
  formatDuration,
  formatReason,
  getReasonFix,
  getActiveSessionCount,
  getActiveSessionForUser,
  getActiveSessionsSnapshot,
  handleVoiceStateUpdate,
  startRewardProcessor,
  stopRewardProcessor
};
