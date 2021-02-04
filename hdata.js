const net = require('net');
const crypto = require('crypto');

function writeEnc(key, c, msg) {
	var tmp = [];
	for (var i = 0; i < Math.ceil(msg.length/128); i++) {
		tmp.push(msg.substring(i*128, i*128+128));
	}
	for (var i in tmp) {
		c.write(crypto.publicEncrypt(key, tmp[i]));
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
	var keypair = crypto.generateKeyPairSync('rsa', {
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
	var serverpub = "";
	var cli = net.connect(options.port, options.host, function () {});
	function getServerPub(data) {
		serverpub += data.toString();
		if (serverpub.endsWith("\n")) {
			writeEnc(serverpub, cli, keypair.publicKey+"\n");
			cli.removeListener('data', getServerPub);
		}
	}
	cli.on('data', getServerPub);
	this.sendCmd = function (cmd, callback) {
		var buf = "";
		try {
			function getResponse(data) {
				for (var i = 0; i < Math.ceil(data.length/512); i++) {
					var tmp = data.slice(i*512, i*512+512);
					buf += crypto.privateDecrypt(keypair.privateKey, tmp).toString();
				}
				if (buf.endsWith("\n")) {
					callback(JSON.parse(buf), undefined);
					buf = "";
					cli.removeListener('data', getResponse);
				}
			}
			cli.on('data', getResponse);
			writeEnc(serverpub, cli, JSON.stringify(cmd) + "\n");
		} catch (err) {
			callback({}, err);
		}
	}
	this.status = function (callback) {
		var cmd = { "cmd": "status" };
		this.sendCmd(cmd, callback);
	}
	this.login = function(user, password, callback) {
		var cmd = { "cmd": "login", "user": user, "password": password };
		this.sendCmd(cmd, callback);
	}
	this.logout = function(callback) {
		var cmd = { "cmd": "logout" };
		this.sendCmd(cmd, callback);
	}
	this.createUser = function(user, password, permissions, callback) {
		var cmd = { "cmd": "createuser", "user": user, "password": password, "permissions": permissions };
		this.sendCmd(cmd, callback);
	}
	this.deleteUser = function(user, callback) {
		var cmd = { "cmd": "deleteuser", "user": user };
		this.sendCmd(cmd, callback);
	}
	this.updateUser = function(user, property, content, callback) {
		var cmd = { "cmd": "updateuser", "user": user, "property": property, "content": content };
		this.sendCmd(cmd, callback);
	}
	this.updatePassword = function(user, password, callback) {
		var cmd = { "cmd": "updatepassword", "user": user, "password": password };
		this.sendCmd(cmd, callback);
	}
	this.createTable = function (tableName, callback) {
		var cmd = { "cmd": "createtable", "table": tableName };
		this.sendCmd(cmd, callback);
	}
	this.deleteTable = function (tableName, callback) {
		var cmd = { "cmd": "deletetable", "table": tableName };
		this.sendCmd(cmd, callback);
	}
	this.getKey = function (tableName, keyName, callback) {
		var cmd = { "cmd": "getkey", "table": tableName, "key": keyName };
		this.sendCmd(cmd, callback);
	}
	this.setKey = function (tableName, keyName, content, callback) {
		var cmd = { "cmd": "setkey", "table": tableName, "key": keyName, "content": content };
		this.sendCmd(cmd, callback);
	}
	this.deleteKey = function (tableName, keyName, callback) {
		var cmd = { "cmd": "deletekey", "table": tableName, "key": keyName };
		this.sendCmd(cmd, callback);
	}
	this.queryAll = function (evaluator, callback) {
		var cmd = { "cmd": "queryall", "evaluator": evaluator };
		this.sendCmd(cmd, callback);
	}
	this.queryTable = function (tableName, evaluator, callback) {
		var cmd = { "cmd": "querytable", "table": tableName, "evaluator": evaluator };
		this.sendCmd(cmd, callback);
	}
	this.tableExists = function (tableName, callback) {
		var cmd = { "cmd": "tableexists", "table": tableName };
		this.sendCmd(cmd, callback);
	}
	this.tableSize = function (tableName, callback) {
		var cmd = { "cmd": "tablesize", "table": tableName };
		this.sendCmd(cmd, callback);
	}
	this.tableKeys = function (tableName, callback) {
		var cmd = { "cmd": "tablekeys", "table": tableName };
		this.sendCmd(cmd, callback);
	}
	this.save = function (callback) {
		var cmd = { "cmd": "save" };
		this.sendCmd(cmd, callback);
	}
	this.close = function(callback) {
		var cmd = { "cmd": "logout" };
		this.sendCmd(cmd, function(res, err) {
			cli.end();
			callback({}, undefined);
		});
	}
}
