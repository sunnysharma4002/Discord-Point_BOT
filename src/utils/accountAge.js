const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MIN_ACCOUNT_AGE_DAYS = 60;
const MIN_ACCOUNT_AGE_MS = MIN_ACCOUNT_AGE_DAYS * MS_PER_DAY;

function getCreatedTimestamp(user) {
  const createdTimestamp = Number(user?.createdTimestamp);
  if (Number.isFinite(createdTimestamp) && createdTimestamp > 0) {
    return createdTimestamp;
  }

  const createdAtTimestamp = user?.createdAt instanceof Date
    ? user.createdAt.getTime()
    : Number.NaN;

  if (Number.isFinite(createdAtTimestamp) && createdAtTimestamp > 0) {
    return createdAtTimestamp;
  }

  return null;
}

function getAccountAgeMs(user, now = Date.now()) {
  const createdTimestamp = getCreatedTimestamp(user);
  if (!createdTimestamp) {
    return null;
  }

  return Math.max(0, now - createdTimestamp);
}

function isAccountOldEnough(user, now = Date.now()) {
  const ageMs = getAccountAgeMs(user, now);
  return typeof ageMs === 'number' && ageMs >= MIN_ACCOUNT_AGE_MS;
}

function getRemainingAccountAgeDays(user, now = Date.now()) {
  const ageMs = getAccountAgeMs(user, now);
  if (ageMs === null) {
    return MIN_ACCOUNT_AGE_DAYS;
  }

  return Math.max(0, Math.ceil((MIN_ACCOUNT_AGE_MS - ageMs) / MS_PER_DAY));
}

function formatAccountAgeRequirement() {
  return `${MIN_ACCOUNT_AGE_DAYS} days`;
}

function formatRemainingDays(days) {
  const safeDays = Math.max(0, Number(days) || 0);
  return `${safeDays} day${safeDays === 1 ? '' : 's'}`;
}

function buildTooNewMessage(user, now = Date.now()) {
  const remainingDays = getRemainingAccountAgeDays(user, now);
  const retryText = remainingDays > 0
    ? ` Try again in ${formatRemainingDays(remainingDays)}.`
    : '';

  return `Your Discord account must be at least ${formatAccountAgeRequirement()} old to earn coins.${retryText}`;
}

module.exports = {
  MIN_ACCOUNT_AGE_DAYS,
  buildTooNewMessage,
  formatAccountAgeRequirement,
  formatRemainingDays,
  getAccountAgeMs,
  getRemainingAccountAgeDays,
  isAccountOldEnough
};
