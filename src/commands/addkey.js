const { SlashCommandBuilder } = require('discord.js');
const keyManager = require('../utils/keyManager');
const { requireAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addkey')
    .setDescription('Add a new claimable key.')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('key')
        .setDescription('The key to add.')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) {
      return;
    }

    const keyValue = interaction.options.getString('key', true);
    const result = await keyManager.addKey(interaction.guildId, keyValue, interaction.user.id);

    if (!result.added) {
      await interaction.reply({
        content: 'That key already exists for this server.',
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: `Key added. Queue ID: ${result.id}.`,
      ephemeral: true
    });
  }
};
