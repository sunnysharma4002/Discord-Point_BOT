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
  if (!String(process.env[key] || '').trim()) {
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
        loggedIn: client.isReady(),
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
  console.error('[process] Unhandled promise rejection:', error);
});

process.on('SIGINT', () => {
  console.log('[process] SIGINT received. Shutting down.');
  healthServer?.close();
  client.destroy();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN.trim()).catch((error) => {
  console.error('[login] Discord login failed:', error);
});
