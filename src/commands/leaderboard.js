const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const database = require('../utils/database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the top users by coins.')
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply();

    const users = await database.getLeaderboard(interaction.guildId, 10);

    if (users.length === 0) {
      await interaction.editReply('No one has earned coins yet.');
      return;
    }

    const lines = await Promise.all(users.map(async (entry, index) => {
      const member = await interaction.guild.members.fetch(entry.userId).catch(() => null);
      const name = member ? member.user.username : `User ${entry.userId}`;
      return `**${index + 1}.** ${name} - ${entry.coins} coins`;
    }));

    const embed = new EmbedBuilder()
      .setColor(0xf2c94c)
      .setTitle('Coin Leaderboard')
      .setDescription(lines.join('\n'));

    await interaction.editReply({ embeds: [embed] });
  }
};
