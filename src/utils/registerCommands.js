const fs = require('node:fs');
const path = require('node:path');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

function loadCommandPayloads() {
  const commands = [];
  const commandsPath = path.join(__dirname, '..', 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data) {
      commands.push(command.data.toJSON());
    }
  }

  return commands;
}

async function registerCommands() {
  const requiredEnv = ['DISCORD_TOKEN', 'CLIENT_ID'];
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      throw new Error(`${key} is required before registering slash commands.`);
    }
  }

  const commands = loadCommandPayloads();
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const route = process.env.GUILD_ID
    ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    : Routes.applicationCommands(process.env.CLIENT_ID);

  await rest.put(route, { body: commands });

  return {
    count: commands.length,
    scope: process.env.GUILD_ID ? `guild ${process.env.GUILD_ID}` : 'global'
  };
}

module.exports = {
  registerCommands
};
