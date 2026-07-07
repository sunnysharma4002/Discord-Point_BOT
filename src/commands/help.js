const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available bot commands.')
    .setDMPermission(false),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Voice Coin Bot Commands')
      .addFields(
        {
          name: 'User',
          value: [
            '`/balance` - show your coins and voice time',
            '`/leaderboard` - show top coin balances',
            '`/claim` - spend coins to claim a key',
            '`/daily` - claim daily bonus coins',
            '`/help` - show this command list'
          ].join('\n')
        },
        {
          name: 'Admin',
          value: [
            '`/addkey` - add a claimable key',
            '`/addcoin` - add coins to a user',
            '`/removecoin` - remove coins from a user',
            '`/resetuser` - reset a user balance',
            '`/setrate` - update reward settings',
            '`/stats` - show bot stats'
          ].join('\n')
        },
        {
          name: 'Earning',
          value: 'Users earn coins while connected, unmuted, undeafened, outside the AFK channel, and not alone. Go Live streaming earns the configured bonus.'
        }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
