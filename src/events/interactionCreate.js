const { Events } = require('discord.js');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({
        content: 'That command is not loaded on this worker.',
        ephemeral: true
      });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`[interaction] /${interaction.commandName} failed:`, error);

      const payload = {
        content: 'Something went wrong while running that command.',
        ephemeral: true
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload);
      } else {
        await interaction.reply(payload);
      }
    }
  }
};
