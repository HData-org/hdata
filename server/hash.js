const crypto = require('crypto');
const worker_threads = require('worker_threads');
worker_threads.parentPort.on('message', function(data) {
	worker_threads.parentPort.postMessage(crypto.pbkdf2Sync(data.password, data.passsalt, 100000, 512, 'sha512').toString('hex') == data.passhash);
});