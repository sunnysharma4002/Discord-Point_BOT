require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

const requiredEnv = ['DISCORD_TOKEN', 'CLIENT_ID'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`${key} is required before deploying slash commands.`);
  }
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function main() {
  const route = process.env.GUILD_ID
    ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    : Routes.applicationCommands(process.env.CLIENT_ID);

  console.log(`[deploy] Refreshing ${commands.length} slash commands...`);
  await rest.put(route, { body: commands });
  console.log(process.env.GUILD_ID
    ? '[deploy] Guild slash commands deployed.'
    : '[deploy] Global slash commands deployed. Propagation can take up to 1 hour.');
}

main().catch((error) => {
  console.error('[deploy] Failed to deploy slash commands:', error);
  process.exit(1);
});
