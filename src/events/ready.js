const { Events, ActivityType } = require('discord.js');
const database = require('../utils/database');
const rewards = require('../utils/rewards');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    await database.initDatabase();
    rewards.bootstrapExistingVoiceSessions(client);
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
