const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../utils/database');
const rewards = require('../utils/rewards');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Show your coin balance.')
    .setDMPermission(false),

  async execute(interaction) {
    const user = await database.getUser(interaction.guildId, interaction.user.id);
    const activeSession = rewards.getActiveSessionForUser(interaction.guildId, interaction.user.id);
    const currentVcSeconds = activeSession?.totalSeconds || 0;
    const currentLiveSeconds = activeSession?.totalLiveSeconds || 0;
    const totalVcSeconds = user.totalVcSeconds + currentVcSeconds;
    const totalLiveSeconds = user.totalLiveSeconds + currentLiveSeconds;

    const embed = new EmbedBuilder()
      .setColor(0x2f80ed)
      .setTitle('Your Balance')
      .addFields(
        { name: 'Coins', value: `${user.coins}`, inline: true },
        {
          name: 'VC Time',
          value: rewards.formatDuration(totalVcSeconds),
          inline: true
        },
        {
          name: 'Live Time',
          value: rewards.formatDuration(totalLiveSeconds),
          inline: true
        }
      );

    if (activeSession) {
      embed.addFields({
        name: 'Current Session',
        value: activeSession.eligible
          ? `Earning now in <#${activeSession.channelId}>${activeSession.live ? ' with live bonus' : ''}.`
          : `Not earning right now: ${activeSession.lastIneligibilityReason.replaceAll('_', ' ')}.`,
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
