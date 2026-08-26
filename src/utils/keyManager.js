const database = require('./database');

async function addKey(guildId, keyValue, createdBy) {
  return database.addKey(guildId, keyValue, createdBy);
}

async function claimKeyForUser(guildId, userId) {
  const settings = await database.getSettings(guildId);
  return database.claimKey(guildId, userId, settings.claimCost);
}

async function refundClaim(guildId, userId, keyId, cost) {
  return database.revertClaim(guildId, userId, keyId, cost);
}

module.exports = {
  addKey,
  claimKeyForUser,
  refundClaim
};
