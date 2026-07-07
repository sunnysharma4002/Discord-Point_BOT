const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../utils/database');
const rewards = require('../utils/rewards');
const { requireAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrate')
    .setDescription('Change coin earning and claim settings.')
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option
        .setName('interval_minutes')
        .setDescription('Reward interval in minutes.')
        .setMinValue(1)
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName('reward_amount')
        .setDescription('Base coins per interval.')
        .setMinValue(1)
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName('live_bonus_amount')
        .setDescription('Extra coins per interval while streaming.')
        .setMinValue(0)
        .setRequired(false)
    )
    .addIntegerOption((option) =>
      option
        .setName('claim_cost')
        .setDescription('Coins required to claim a key.')
        .setMinValue(1)
        .setRequired(false)
    ),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) {
      return;
    }

    const patch = {
      rewardIntervalMinutes: interaction.options.getInteger('interval_minutes'),
      rewardAmount: interaction.options.getInteger('reward_amount'),
      liveBonusAmount: interaction.options.getInteger('live_bonus_amount'),
      claimCost: interaction.options.getInteger('claim_cost')
    };

    const selectedValues = Object.values(patch).filter((value) => value !== null);
    if (selectedValues.length === 0) {
      await interaction.reply({
        content: 'Choose at least one setting to update.',
        ephemeral: true
      });
      return;
    }

    const settings = await database.updateSettings(interaction.guildId, patch);
    rewards.clearSettingsCache(interaction.guildId);

    const embed = new EmbedBuilder()
      .setColor(0x22a06b)
      .setTitle('Reward Settings Updated')
      .addFields(
        {
          name: 'Interval',
          value: `${settings.rewardIntervalMinutes} minutes`,
          inline: true
        },
        {
          name: 'Base Reward',
          value: `${settings.rewardAmount} coins`,
          inline: true
        },
        {
          name: 'Live Bonus',
          value: `${settings.liveBonusAmount} extra coins`,
          inline: true
        },
        {
          name: 'Claim Cost',
          value: `${settings.claimCost} coins`,
          inline: true
        }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
