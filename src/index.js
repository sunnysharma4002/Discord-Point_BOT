require('dotenv').config();

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials
} = require('discord.js');

const requiredEnv = ['DISCORD_TOKEN', 'CLIENT_ID', 'DATABASE_URL'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`${key} is required. Copy .env.example to .env and fill it in.`);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();
let healthServer;
const runtimeState = {
  discordStatus: 'starting',
  lastError: null,
  readyAt: null
};

function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if (!command.data || !command.execute) {
      console.warn(`[commands] Skipping ${file}: missing data or execute export.`);
      continue;
    }

    client.commands.set(command.data.name, command);
  }
}

function loadEvents() {
  const eventsPath = path.join(__dirname, 'events');
  const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

  for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);

    if (!event.name || !event.execute) {
      console.warn(`[events] Skipping ${file}: missing name or execute export.`);
      continue;
    }

    if (event.once) {
      client.once(event.name, (...args) => event.execute(...args, client));
    } else {
      client.on(event.name, (...args) => event.execute(...args, client));
    }
  }
}

loadCommands();
loadEvents();

client.once('clientReady', () => {
  runtimeState.discordStatus = 'ready';
  runtimeState.readyAt = new Date().toISOString();
  runtimeState.lastError = null;
});

client.on('error', (error) => {
  runtimeState.discordStatus = 'error';
  runtimeState.lastError = error?.message || String(error);
  console.error('[client] Discord client error:', error);
});

client.on('shardError', (error) => {
  runtimeState.discordStatus = 'shard_error';
  runtimeState.lastError = error?.message || String(error);
  console.error('[client] Discord shard error:', error);
});

client.on('shardDisconnect', (event, shardId) => {
  runtimeState.discordStatus = 'disconnected';
  runtimeState.lastError = `Shard ${shardId} disconnected with code ${event?.code || 'unknown'}`;
  console.warn('[client] Discord shard disconnected:', runtimeState.lastError);
});

client.on('shardReconnecting', (shardId) => {
  runtimeState.discordStatus = 'reconnecting';
  runtimeState.lastError = `Shard ${shardId} is reconnecting`;
  console.warn('[client] Discord shard reconnecting:', shardId);
});

function startHealthServer() {
  const port = process.env.PORT;
  if (!port) {
    return;
  }

  healthServer = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/health') {
      const payload = JSON.stringify({
        ok: true,
        service: 'discord-vc-coin-bot',
        loggedIn: Boolean(client.user),
        discordStatus: runtimeState.discordStatus,
        readyAt: runtimeState.readyAt,
        lastError: runtimeState.lastError,
        uptimeSeconds: Math.floor(process.uptime())
      });

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      });
      res.end(payload);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
  });

  healthServer.listen(Number(port), '0.0.0.0', () => {
    console.log(`[health] Listening on port ${port}`);
  });
}

startHealthServer();

process.on('unhandledRejection', (error) => {
  runtimeState.discordStatus = 'error';
  runtimeState.lastError = error?.message || String(error);
  console.error('[process] Unhandled promise rejection:', error);
});

process.on('SIGINT', () => {
  console.log('[process] SIGINT received. Shutting down.');
  healthServer?.close();
  client.destroy();
  process.exit(0);
});

runtimeState.discordStatus = 'logging_in';
client.login(process.env.DISCORD_TOKEN).catch((error) => {
  runtimeState.discordStatus = 'login_failed';
  runtimeState.lastError = error?.message || String(error);
  console.error('[login] Discord login failed:', error);
});
