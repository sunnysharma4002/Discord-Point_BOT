const { SlashCommandBuilder } = require('discord.js');
const database = require('../utils/database');
const { requireAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addcoin')
    .setDescription('Add coins to a user.')
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('The user to receive coins.')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Coins to add.')
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
    const reason = interaction.options.getString('reason') || 'admin_add';

    const user = await database.addCoins(
      interaction.guildId,
      target.id,
      amount,
      'admin_add',
      {
        adminId: interaction.user.id,
        reason
      }
    );

    await interaction.reply({
      content: `Added ${amount} coins to ${target}. New balance: ${user.coins}.`,
      ephemeral: true
    });
  }
};
