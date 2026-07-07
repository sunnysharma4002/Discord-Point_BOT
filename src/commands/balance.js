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

    const embed = new EmbedBuilder()
      .setColor(0x2f80ed)
      .setTitle('Your Balance')
      .addFields(
        { name: 'Coins', value: `${user.coins}`, inline: true },
        {
          name: 'VC Time',
          value: rewards.formatDuration(user.totalVcSeconds),
          inline: true
        },
        {
          name: 'Live Time',
          value: rewards.formatDuration(user.totalLiveSeconds),
          inline: true
        }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
