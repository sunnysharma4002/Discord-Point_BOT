const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const keyManager = require('../utils/keyManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Claim a free key using coins.')
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const result = await keyManager.claimKeyForUser(interaction.guildId, interaction.user.id);

    if (!result.ok && result.reason === 'NO_KEYS') {
      await interaction.editReply('No keys available right now.');
      return;
    }

    if (!result.ok && result.reason === 'INSUFFICIENT_COINS') {
      await interaction.editReply(
        `You need ${result.cost} coins to claim a key. Your balance is ${result.balance}.`
      );
      return;
    }

    try {
      const embed = new EmbedBuilder()
        .setColor(0x22a06b)
        .setTitle('Your Claimed Key')
        .setDescription(`\`${result.keyValue}\``)
        .setFooter({ text: `Cost: ${result.cost} coins` });

      await interaction.user.send({ embeds: [embed] });
      await interaction.editReply(
        `Key claimed and sent to your DMs. New balance: ${result.balance} coins.`
      );
    } catch (error) {
      await keyManager.refundClaim(
        interaction.guildId,
        interaction.user.id,
        result.keyId,
        result.cost
      );

      await interaction.editReply(
        'I could not DM you the key, so your coins were refunded. Please enable DMs and try again.'
      );
    }
  }
};
