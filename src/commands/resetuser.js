const { SlashCommandBuilder } = require('discord.js');
const database = require('../utils/database');
const { requireAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resetuser')
    .setDescription('Reset a user coin balance to 0.')
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to reset.')
        .setRequired(true)
    ),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) {
      return;
    }

    const target = interaction.options.getUser('user', true);
    const user = await database.setCoins(
      interaction.guildId,
      target.id,
      0,
      'admin_reset',
      { adminId: interaction.user.id }
    );

    await interaction.reply({
      content: `${target}'s balance has been reset to ${user.coins} coins.`,
      ephemeral: true
    });
  }
};
