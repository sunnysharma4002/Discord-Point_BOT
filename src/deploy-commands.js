require('dotenv').config();

const { registerCommands } = require('./utils/registerCommands');

async function main() {
  console.log('[deploy] Refreshing slash commands...');
  const result = await registerCommands();
  console.log(`[deploy] Deployed ${result.count} slash commands to ${result.scope}.`);
  if (!process.env.GUILD_ID) {
    console.log('[deploy] Global commands can take up to 1 hour to appear.');
  }
}

main().catch((error) => {
  console.error('[deploy] Failed to deploy slash commands:', error);
  process.exit(1);
});
