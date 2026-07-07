const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../utils/database');
const rewards = require('../utils/rewards');

function buildProgressBar(currentSeconds, intervalSeconds) {
  const width = 10;
  const progress = intervalSeconds > 0
    ? Math.min(1, Math.max(0, currentSeconds / intervalSeconds))
    : 0;
  const filled = Math.round(progress * width);
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

function getClaimStatus(coins, claimCost) {
  if (coins >= claimCost) {
    return 'Ready to claim';
  }

  return `${claimCost - coins} more coin(s) needed`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Show your coin balance.')
    .setDMPermission(false),

  async execute(interaction) {
    const [user, settings] = await Promise.all([
      database.getUser(interaction.guildId, interaction.user.id),
      database.getSettings(interaction.guildId)
    ]);

    const activeSession = rewards.getActiveSessionForUser(interaction.guildId, interaction.user.id);
    const currentVcSeconds = activeSession?.totalSeconds || 0;
    const currentLiveSeconds = activeSession?.totalLiveSeconds || 0;
    const totalVcSeconds = user.totalVcSeconds + currentVcSeconds;
    const totalLiveSeconds = user.totalLiveSeconds + currentLiveSeconds;
    const intervalSeconds = Math.max(60, settings.rewardIntervalMinutes * 60);
    const memberName = interaction.member?.displayName || interaction.user.username;

    const statusColor = activeSession?.eligible
      ? 0x22a06b
      : activeSession
        ? 0xf2994a
        : 0x2f80ed;

    const embed = new EmbedBuilder()
      .setColor(statusColor)
      .setTitle(`${memberName}'s Coin Dashboard`)
      .setThumbnail(interaction.user.displayAvatarURL({ size: 128 }))
      .addFields(
        {
          name: 'Wallet',
          value: [
            `Coins: **${user.coins}**`,
            `Claim cost: **${settings.claimCost}**`,
            `Claim status: **${getClaimStatus(user.coins, settings.claimCost)}**`
          ].join('\n'),
          inline: true
        },
        {
          name: 'Voice Time',
          value: [
            `Total VC: **${rewards.formatDuration(totalVcSeconds)}**`,
            `Live: **${rewards.formatDuration(totalLiveSeconds)}**`,
            `This session: **${activeSession ? rewards.formatDuration(activeSession.connectedSeconds) : '0s'}**`
          ].join('\n'),
          inline: true
        }
      );

    if (activeSession) {
      const statusLines = activeSession.eligible
        ? [
            `Status: **earning now**`,
            `Channel: <#${activeSession.channelId}>`,
            `Rate: **${settings.rewardAmount}** coin(s) every **${settings.rewardIntervalMinutes}m**`,
            `Live bonus: **+${settings.liveBonusAmount}** coin(s)${activeSession.live ? ' active' : ' when streaming'}`
          ]
        : [
            `Status: **paused**`,
            `Reason: **${activeSession.reasonLabel}**`,
            `Fix: ${activeSession.reasonFix}`
          ];

      embed.addFields({
        name: 'Current Session',
        value: statusLines.join('\n'),
        inline: false
      });

      if (activeSession.eligible) {
        const baseProgress = activeSession.pendingBaseSeconds % intervalSeconds;
        const baseRemaining = intervalSeconds - baseProgress;
        const payoutLines = [
          `${buildProgressBar(baseProgress, intervalSeconds)} ${rewards.formatDuration(baseRemaining)} to next base coin payout`,
          `Session coins earned: **${activeSession.coinsAwarded}**`
        ];

        if (activeSession.live && settings.liveBonusAmount > 0) {
          const liveProgress = activeSession.pendingLiveSeconds % intervalSeconds;
          const liveRemaining = intervalSeconds - liveProgress;
          payoutLines.push(
            `${buildProgressBar(liveProgress, intervalSeconds)} ${rewards.formatDuration(liveRemaining)} to next live bonus`
          );
        }

        embed.addFields({
          name: 'Next Payout',
          value: payoutLines.join('\n'),
          inline: false
        });
      }
    } else {
      embed.addFields({
        name: 'Current Session',
        value: [
          'Status: **not in a voice channel**',
          'Join VC with at least one other real user to start earning.'
        ].join('\n'),
        inline: false
      });
    }

    embed.setFooter({
      text: 'Coins update every 30 seconds while you stay eligible.'
    });

    await interaction.reply({ embeds: [embed] });
  }
};
