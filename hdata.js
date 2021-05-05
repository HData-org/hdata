const fs = require('fs');
const net = require('net');
const crypto = require('crypto');
const constants = require('constants');

function writeEnc(key, c, msg) {
	var tmp = [];
	for (var i = 0; i < Math.ceil(msg.length/128); i++) {
		tmp.push(msg.substring(i*128, i*128+128));
	}
	for (var i in tmp) {
		c.write(crypto.publicEncrypt(key, Buffer.from(tmp[i])));
	}
}

exports.HData = function (options) {
	if (options == undefined) {
		options = {};
	}
	if (options.port == undefined) {
		options.port = 8888;
	} else if (options.port.toString().trim() == "") {
		options.port = 8888;
	}
	if (options.host == undefined) {
		options.host = "127.0.0.1";
	} else if (options.host.trim() == "") {
		options.host = "127.0.0.1";
	}
	if (options.datadir == undefined) {
		options.datadir = "./";
	}
	if (options.cachecerts == undefined) {
		options.cachecerts = true;
	}
	var keypair = {};
	if (options.cachecerts && fs.existsSync(options.datadir+"clientkey.pem") && fs.existsSync(options.datadir+"clientcert.pem")) {
		keypair.publicKey = fs.readFileSync(options.datadir+'clientcert.pem', 'utf8');
		keypair.privateKey = fs.readFileSync(options.datadir+'clientkey.pem', 'utf8');
	} else {
		keypair = crypto.generateKeyPairSync('rsa', {
			modulusLength: 4096,
			publicKeyEncoding: {
				type: 'spki',
				format: 'pem'
			},
			privateKeyEncoding: {
				type: 'pkcs8',
				format: 'pem'
			}
		});
		if (options.cachecerts) {
			try {
				fs.writeFileSync(options.datadir+"clientkey.pem", keypair.privateKey.toString(), "utf8");
				fs.writeFileSync(options.datadir+"clientcert.pem", keypair.publicKey.toString(), "utf8");
			} catch(err) {}
		}
	}
	var connected = false;
	var queue = [];
	var serverpub = "";
	function doJobs() {
		if (queue.length > 0) {
			var buf = "";
			function getResponse(data) {
				try {
					for (var i = 0; i < Math.ceil(data.length/512); i++) {
						var tmp = data.slice(i*512, i*512+512);
						buf += crypto.privateDecrypt(keypair.privateKey, tmp).toString();
					}
					if (buf.endsWith("\n")) {
						cli.removeListener('data', getResponse);
						queue[0].callback(JSON.parse(buf), undefined);
						queue.shift();
						buf = "";
						doJobs();
					}
				} catch (err) {
					cli.removeListener('data', getResponse);
					queue[0].callback({}, err);
					queue.shift();
					buf = "";
					doJobs();
				}
			}
			try {
				cli.on('data', getResponse);
				writeEnc(serverpub, cli, JSON.stringify(queue[0].cmd) + "\n");
			} catch (err) {
				cli.removeListener('data', getResponse);
				queue[0].callback({}, err);
				queue.shift();
				buf = "";
				doJobs();
			}
		}
	}
	var cli = net.connect(options.port, options.host, function () {});
	function getServerPub(data) {
		serverpub += data.toString();
		if (serverpub.endsWith("\n")) {
			connected = true;
			writeEnc(serverpub, cli, keypair.publicKey+"\n");
			cli.removeListener('data', getServerPub);
			setTimeout(doJobs, 2);
		}
	}
	cli.on('data', getServerPub);
	cli.on('error', function(err) {
		throw "Failed to connect to HData server"; //why can't I catch errors thrown by a constructor?
	});
	this.promises = {};
	function sendCmd (cmd, callback) {
		queue.push({cmd: cmd, callback: callback});
		if (connected && queue.length == 1) {
			doJobs();
		}
	}
	function sendCmdPromise (cmd) {
		return new Promise((resolve, reject) => {
			sendCmd(cmd, function(res, err) {
				if (err) {
					reject(err);
				} else {
					resolve(res);
				}
			});
		});
	}
	this.sendCmd = sendCmd;
	this.promises.sendCmd = sendCmdPromise;
	this.status = function (callback) {
		var cmd = { "cmd": "status" };
		this.sendCmd(cmd, callback);
	}
	this.promises.status = function() {
		var cmd = { "cmd": "status" };
		return sendCmdPromise(cmd);
	}
	this.login = function(user, password, callback) {
		var cmd = { "cmd": "login", "user": user, "password": password };
		this.sendCmd(cmd, callback);
	}
	this.promises.login = function(user, password) {
		var cmd = { "cmd": "login", "user": user, "password": password };
		return sendCmdPromise(cmd);
	}
	this.logout = function(callback) {
		var cmd = { "cmd": "logout" };
		this.sendCmd(cmd, callback);
	}
	this.promises.logout = function() {
		var cmd = { "cmd": "logout" };
		return sendCmdPromise(cmd);
	}
	this.createUser = function(user, password, permissions, callback) {
		var cmd = { "cmd": "createuser", "user": user, "password": password, "permissions": permissions };
		this.sendCmd(cmd, callback);
	}
	this.promises.createUser = function(user, password, permissions) {
		var cmd = { "cmd": "createuser", "user": user, "password": password, "permissions": permissions };
		return sendCmdPromise(cmd);
	}
	this.deleteUser = function(user, callback) {
		var cmd = { "cmd": "deleteuser", "user": user };
		this.sendCmd(cmd, callback);
	}
	this.promises.deleteUser = function(user) {
		var cmd = { "cmd": "deleteuser", "user": user };
		return sendCmdPromise(cmd);
	}
	this.getUser = function(user, callback) {
		var cmd = { "cmd": "getuser", "user": user };
		this.sendCmd(cmd, callback);
	}
	this.promises.getUser = function(user) {
		var cmd = { "cmd": "getuser", "user": user };
		return sendCmdPromise(cmd);
	}
	this.updateUser = function(user, property, content, callback) {
		var cmd = { "cmd": "updateuser", "user": user, "property": property, "content": content };
		this.sendCmd(cmd, callback);
	}
	this.promises.updateUser = function(user, property, content) {
		var cmd = { "cmd": "updateuser", "user": user, "property": property, "content": content };
		return sendCmdPromise(cmd);
	}
	this.updatePassword = function(user, password, callback) {
		var cmd = { "cmd": "updatepassword", "user": user, "password": password };
		this.sendCmd(cmd, callback);
	}
	this.promises.updatePassword = function(user, password) {
		var cmd = { "cmd": "updatepassword", "user": user, "password": password };
		return sendCmdPromise(cmd);
	}
	this.createTable = function (tableName, callback) {
		var cmd = { "cmd": "createtable", "table": tableName };
		this.sendCmd(cmd, callback);
	}
	this.promises.createTable = function (tableName) {
		var cmd = { "cmd": "createtable", "table": tableName };
		return sendCmdPromise(cmd);
	}
	this.deleteTable = function (tableName, callback) {
		var cmd = { "cmd": "deletetable", "table": tableName };
		this.sendCmd(cmd, callback);
	}
	this.promises.deleteTable = function (tableName) {
		var cmd = { "cmd": "deletetable", "table": tableName };
		return sendCmdPromise(cmd);
	}
	this.getKey = function (tableName, keyName, callback) {
		var cmd = { "cmd": "getkey", "table": tableName, "key": keyName };
		this.sendCmd(cmd, callback);
	}
	this.promises.getKey = function (tableName, keyName) {
		var cmd = { "cmd": "getkey", "table": tableName, "key": keyName };
		return sendCmdPromise(cmd);
	}
	this.setKey = function (tableName, keyName, content, callback) {
		var cmd = { "cmd": "setkey", "table": tableName, "key": keyName, "content": content };
		this.sendCmd(cmd, callback);
	}
	this.promises.setKey = function (tableName, keyName, content) {
		var cmd = { "cmd": "setkey", "table": tableName, "key": keyName, "content": content };
		return sendCmdPromise(cmd);
	}
	this.deleteKey = function (tableName, keyName, callback) {
		var cmd = { "cmd": "deletekey", "table": tableName, "key": keyName };
		this.sendCmd(cmd, callback);
	}
	this.promises.deleteKey = function (tableName, keyName) {
		var cmd = { "cmd": "deletekey", "table": tableName, "key": keyName };
		return sendCmdPromise(cmd);
	}
	this.queryAll = function (evaluator, callback) {
		var cmd = { "cmd": "queryall", "evaluator": evaluator };
		this.sendCmd(cmd, callback);
	}
	this.promises.queryAll = function (evaluator) {
		var cmd = { "cmd": "queryall", "evaluator": evaluator };
		return sendCmdPromise(cmd);
	}
	this.getTables = function(callback) {
		var cmd = { "cmd": "gettables" };
		this.sendCmd(cmd, callback);
	}
	this.promises.getTables = function() {
		var cmd = { "cmd": "gettables" };
		return sendCmdPromise(cmd);
	}
	this.queryTable = function (tableName, evaluator, callback) {
		var cmd = { "cmd": "querytable", "table": tableName, "evaluator": evaluator };
		this.sendCmd(cmd, callback);
	}
	this.promises.queryTable = function (tableName, evaluator) {
		var cmd = { "cmd": "querytable", "table": tableName, "evaluator": evaluator };
		return sendCmdPromise(cmd);
	}
	this.tableExists = function (tableName, callback) {
		var cmd = { "cmd": "tableexists", "table": tableName };
		this.sendCmd(cmd, callback);
	}
	this.promises.tableExists = function (tableName) {
		var cmd = { "cmd": "tableexists", "table": tableName };
		return sendCmdPromise(cmd);
	}
	this.tableSize = function (tableName, callback) {
		var cmd = { "cmd": "tablesize", "table": tableName };
		this.sendCmd(cmd, callback);
	}
	this.promises.tableSize = function (tableName) {
		var cmd = { "cmd": "tablesize", "table": tableName };
		return sendCmdPromise(cmd);
	}
	this.tableKeys = function (tableName, callback) {
		var cmd = { "cmd": "tablekeys", "table": tableName };
		this.sendCmd(cmd, callback);
	}
	this.promises.tableKeys = function (tableName) {
		var cmd = { "cmd": "tablekeys", "table": tableName };
		return sendCmdPromise(cmd);
	}
	this.close = function(callback) {
		var cmd = { "cmd": "logout" };
		this.sendCmd(cmd, function(res, err) {
			cli.end();
			callback({}, undefined);
		});
	}
	this.promises.close = async function() {
		await sendCmdPromise({cmd: "logout"})
		cli.end();
		return new Promise((resolve, reject) => {
			resolve({});
		});
	}
}
