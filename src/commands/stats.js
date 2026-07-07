const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../utils/database');
const rewards = require('../utils/rewards');
const { requireAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show bot stats for this server.')
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAdmin(interaction))) {
      return;
    }

    const [stats, settings] = await Promise.all([
      database.getStats(interaction.guildId),
      database.getSettings(interaction.guildId)
    ]);

    const embed = new EmbedBuilder()
      .setColor(0x6fcf97)
      .setTitle('Bot Stats')
      .addFields(
        { name: 'Users', value: `${stats.users}`, inline: true },
        { name: 'Total Coins', value: `${stats.totalCoins}`, inline: true },
        { name: 'Active VC Sessions', value: `${rewards.getActiveSessionCount(interaction.guildId)}`, inline: true },
        { name: 'Available Keys', value: `${stats.availableKeys}`, inline: true },
        { name: 'Claimed Keys', value: `${stats.claimedKeys}`, inline: true },
        { name: 'Voice Sessions', value: `${stats.voiceSessions}`, inline: true },
        {
          name: 'Total VC Time',
          value: rewards.formatDuration(stats.totalVcSeconds),
          inline: true
        },
        {
          name: 'Total Live Time',
          value: rewards.formatDuration(stats.totalLiveSeconds),
          inline: true
        },
        {
          name: 'Reward Rate',
          value: `${settings.rewardAmount} coin(s) every ${settings.rewardIntervalMinutes} minute(s), plus ${settings.liveBonusAmount} while live`,
          inline: false
        }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
