require('dotenv').config();

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  Status
} = require('discord.js');

const requiredEnv = ['DISCORD_TOKEN', 'CLIENT_ID', 'DATABASE_URL'];
for (const key of requiredEnv) {
  if (!String(process.env[key] || '').trim()) {
    throw new Error(`${key} is required. Copy .env.example to .env and fill it in.`);
  }
}

const discordToken = process.env.DISCORD_TOKEN.trim();

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
  loginAttempts: 0,
  loginStartedAt: null,
  lastError: null,
  readyAt: null
};
let loginTimeout;

const gatewayStatusNames = Object.fromEntries(
  Object.entries(Status)
    .filter(([, value]) => typeof value === 'number')
    .map(([key, value]) => [value, key])
);

function markDiscordReady() {
  runtimeState.discordStatus = 'ready';
  runtimeState.readyAt = new Date().toISOString();
  runtimeState.lastError = null;
  if (loginTimeout) {
    clearTimeout(loginTimeout);
    loginTimeout = undefined;
  }
}

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

client.once('clientReady', markDiscordReady);
client.once('ready', markDiscordReady);

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
        loggedIn: client.isReady(),
        discordStatus: runtimeState.discordStatus,
        gatewayStatus: client.ws.status,
        gatewayStatusName: gatewayStatusNames[client.ws.status] || 'Unknown',
        loginAttempts: runtimeState.loginAttempts,
        readyAt: runtimeState.readyAt,
        loginStartedAt: runtimeState.loginStartedAt,
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

function scheduleLoginRetry() {
  setTimeout(() => {
    if (client.isReady()) {
      return;
    }

    console.warn('[login] Retrying Discord login after timeout.');
    client.destroy();
    startDiscordLogin();
  }, 15_000).unref?.();
}

function startDiscordLogin() {
  if (loginTimeout) {
    clearTimeout(loginTimeout);
  }

  runtimeState.discordStatus = 'logging_in';
  runtimeState.loginAttempts += 1;
  runtimeState.loginStartedAt = new Date().toISOString();
  runtimeState.lastError = null;

  client.login(discordToken).catch((error) => {
    runtimeState.discordStatus = 'login_failed';
    runtimeState.lastError = error?.message || String(error);
    console.error('[login] Discord login failed:', error);
    scheduleLoginRetry();
  });

  loginTimeout = setTimeout(() => {
    if (client.isReady()) {
      return;
    }

    runtimeState.discordStatus = 'login_timeout';
    runtimeState.lastError = 'Discord ready event was not received within 60 seconds. Retrying login shortly.';
    console.warn('[login] Discord ready event was not received within 60 seconds.');
    scheduleLoginRetry();
  }, 60_000);

  loginTimeout.unref?.();
}

startDiscordLogin();
