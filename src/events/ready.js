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
      const result = await registerCommands();
      console.log(`[ready] Registered ${result.count} slash commands to ${result.scope}.`);
    }

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
