const { PermissionFlagsBits } = require('discord.js');

function hasAdminAccess(interaction) {
  if (!interaction.inGuild()) {
    return false;
  }

  const adminRoleId = process.env.ADMIN_ROLE_ID;
  const hasConfiguredRole = adminRoleId
    ? interaction.member?.roles?.cache?.has(adminRoleId)
    : false;

  const hasDiscordAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  const canManageGuild = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);

  return Boolean(hasConfiguredRole || hasDiscordAdmin || canManageGuild);
}

async function requireAdmin(interaction) {
  if (hasAdminAccess(interaction)) {
    return true;
  }

  const payload = {
    content: 'You do not have permission to use this admin command.',
    ephemeral: true
  };

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
  } else {
    await interaction.reply(payload);
  }

  return false;
}

module.exports = {
  hasAdminAccess,
  requireAdmin
};
