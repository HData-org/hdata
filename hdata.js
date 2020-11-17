const net = require('net');

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
	this.sendCmd = function (cmd, callback) {
		var buf = "";
		try {
			var cli = net.connect(options.port, options.host, function () {
				cli.write(JSON.stringify(cmd) + "\n");
			});
			cli.on('data', function (data) {
				buf += data.toString();
				if (buf.endsWith("\n")) {
					callback(JSON.parse(buf), undefined);
				}
			});
		} catch (err) {
			callback({}, err);
		}
	}
	this.status = function (callback) {
		var cmd = { "cmd": "status" };
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
}
