const { Events } = require('discord.js');
const rewards = require('../utils/rewards');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState) {
    try {
      await rewards.handleVoiceStateUpdate(oldState, newState);
    } catch (error) {
      console.error('[voiceStateUpdate] Failed to process voice state:', error);
    }
  }
};
