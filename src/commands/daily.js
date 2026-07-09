const { SlashCommandBuilder } = require('discord.js');
const accountAge = require('../utils/accountAge');
const database = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily bonus coins.')
    .setDMPermission(false),

  async execute(interaction) {
    if (!accountAge.isAccountOldEnough(interaction.user)) {
      await interaction.reply({
        content: accountAge.buildTooNewMessage(interaction.user),
        ephemeral: true
      });
      return;
    }

    const amount = database.getDefaultSettings().dailyBonusAmount;
    const result = await database.claimDaily(interaction.guildId, interaction.user.id, amount);

    if (!result.ok) {
      await interaction.reply({
        content: `You already claimed your daily bonus today. Balance: ${result.user.coins} coins.`,
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: `You claimed ${result.amount} daily coins. Balance: ${result.user.coins} coins.`,
      ephemeral: true
    });
  }
};
