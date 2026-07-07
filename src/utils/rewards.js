const { Events, ActivityType } = require('discord.js');
const database = require('../utils/database');
const { registerCommands } = require('../utils/registerCommands');
const rewards = require('../utils/rewards');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await database.initDatabase();

    if (process.env.REGISTER_COMMANDS_ON_START === 'true') {
      try {
        const result = await registerCommands();
        console.log(`[ready] Registered ${result.count} slash commands to ${result.scope}.`);
      } catch (error) {
        console.error('[ready] Could not register slash commands:', error);
        console.error(
          '[ready] Check that CLIENT_ID belongs to this bot, GUILD_ID is correct, and the bot was invited with the applications.commands scope.'
        );
      }
    }

    if (typeof rewards.bootstrapExistingVoiceSessions === 'function') {
      rewards.bootstrapExistingVoiceSessions(client);
    } else {
      console.warn(
        `[ready] bootstrapExistingVoiceSessions is missing from rewards exports. Available exports: ${Object.keys(rewards).join(', ')}`
      );
    }

    if (typeof rewards.startRewardProcessor !== 'function') {
      throw new Error('startRewardProcessor is missing from rewards exports.');
    }

    rewards.startRewardProcessor(client);

    client.user.setPresence({
      activities: [
        {
          name: 'voice channels for coin rewards',
          type: ActivityType.Watching
        }
      ],
      status: 'online'
    });

    console.log(`[ready] Logged in as ${client.user.tag}`);
    console.log(`[ready] Loaded ${client.commands.size} slash commands.`);
  }
};
