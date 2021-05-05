const crypto = require('crypto');
process.send(crypto.pbkdf2Sync(process.env.password, process.env.passsalt, 100000, 512, 'sha512').toString('hex') == process.env.passhash);