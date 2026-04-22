const crypto = require('crypto');

function id(prefix = '') {
  const part = Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  return prefix ? `${prefix}_${part}` : part;
}

function token() {
  return crypto.randomBytes(24).toString('hex'); // 48 chars
}

module.exports = { id, token };
