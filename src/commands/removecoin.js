const { SlashCommandBuilder } = require('discord.js');
const database = require('../utils/database');
const { requireAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removecoin')
    .setDescription('Remove coins from a user.')
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to remove coins from.')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Coins to remove.')
        .setMinValue(1)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Optional audit reason.')
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) {
      return;
    }

    const target = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const reason = interaction.options.getString('reason') || 'admin_remove';

    const user = await database.removeCoins(
      interaction.guildId,
      target.id,
      amount,
      'admin_remove',
      {
        adminId: interaction.user.id,
        reason
      }
    );

    await interaction.reply({
      content: `Removed ${amount} coins from ${target}. New balance: ${user.coins}.`,
      ephemeral: true
    });
  }
};
