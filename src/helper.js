const chalk = require('chalk')

function warn( message ) {
  if (message in warn.cache) {
    return;
  }

  const prefix = chalk.hex('#CC4A8B')('WARNING');
  console.warn(chalk`${prefix}${message}`);
}

warn.cache = Object.create(null);
