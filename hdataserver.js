process.on('uncaughtException', function (err) {
	console.log(err);
	if (!(fs.existsSync("./logs"))) {
		fs.mkdirSync("logs");
	}
	fs.appendFileSync("./logs/error.log", "[" + new Date().getTime() + "] " + err.toString() + "\n");
});

const net = require('net');
const fs = require('fs');

function transfer(datadir) {
	console.log("Transfering old database...");
	if (!fs.existsSync(datadir)) {
		fs.mkdirSync(datadir);
	}
	var tmpdb = JSON.parse(fs.readFileSync("./data.json"));
	for (var table in tmpdb) {
		transact({"cmd":"createtable","table":table}, datadir);
		for (var key in tmpdb[table]) {
			transact({"cmd":"setkey","table":table,"key":key,"content":tmpdb[table][key]}, datadir);
		}
	}
	fs.renameSync("./data.json", "./data.json.moved")
	console.log("Old database transferred");
}

function load(map, datadir, since) {
	console.log("Rebuilding database");
	if (!fs.existsSync(datadir)) {
		fs.mkdirSync(datadir);
	}
	var dir = fs.readdirSync(datadir);
	for (var i = (since || 1); i <= dir.length; i++) {
		var tmpdata = JSON.parse(fs.readFileSync(datadir + "/" + i));
		switch (tmpdata.cmd) {
			default:
				break;
			case "createtable":
				var tmpmap = new Map();
				map.set(tmpdata.table, tmpmap);
				break;
			case "deletetable":
				map.delete(tmpdata.table);
				break;
			case "setkey":
				var tmpmap = map.get(tmpdata.table);
				tmpmap.set(tmpdata.key, tmpdata.content);
				break;
			case "deletekey":
				var tmpmap = map.get(tmpdata.table);
				tmpmap.delete(tmpdata.key);
				break;
		}
	}
	console.log("Database rebuilt");
}

function transact(request, datadir) {
	var num = fs.readdirSync(datadir).length;
	fs.writeFileSync(datadir + "/" + (num + 1), JSON.stringify(request));
}

function runJob(c, request) {
	switch (request.cmd) {
		default:
			break;
		case "status":
			c.write("{\"status\":\"OK\",\"jobs\":\"" + jobs.length + "\",\"tables\":\"" + map.size + "\"}\n");
			break;
		case "createtable":
			if (map.has(request.table)) {
				c.write("{\"status\":\"TE\"}\n");
			} else {
				var tmpmap = new Map();
				map.set(request.table, tmpmap);
				transact(request, config.datadir);
				c.write("{\"status\":\"OK\"}\n");
			}
			break;
		case "deletetable":
			if (map.has(request.table)) {
				map.delete(request.table);
				transact(request, config.datadir);
				c.write("{\"status\":\"OK\"}\n");
			} else {
				c.write("{\"status\":\"TDNE\"}\n");
			}
			break;
		case "getkey":
			if (map.has(request.table)) {
				var tmpmap = map.get(request.table);
				if (tmpmap.has(request.key)) {
					c.write(JSON.stringify(tmpmap.get(request.key)) + "\n");
				} else {
					c.write("{\"status\":\"KDNE\"}\n");
				}
			} else {
				c.write("{\"status\":\"TDNE\"}\n");
			}
			break;
		case "setkey":
			if (map.has(request.table)) {
				var tmpmap = map.get(request.table);
				tmpmap.set(request.key, request.content);
				transact(request, config.datadir);
				c.write("{\"status\":\"OK\"}\n");
			} else {
				c.write("{\"status\":\"TDNE\"}\n");
			}
			break;
		case "deletekey":
			if (map.has(request.table)) {
				var tmpmap = map.get(request.table);
				if (tmpmap.has(request.key)) {
					tmpmap.delete(request.key, request.value);
					transact(request, config.datadir);
					c.write("{\"status\":\"OK\"}\n");
				} else {
					c.write("{\"status\":\"KDNE\"}\n");
				}
			} else {
				c.write("{\"status\":\"TDNE\"}\n");
			}
			break;
	}
	c.end();
	jobs.shift();
	if (jobs.length > 0) {
		runJob(jobs[0].c, jobs[0].request);
	}
}

function serverListener(c) {
	var buffer = "";
	c.on('data', function (data) {
		buffer += data;
		if (buffer.endsWith("}\n")) {
			var request = JSON.parse(buffer);
			buffer = "";
			jobs.push({ "c": c, "request": request });
			if (jobs.length == 1) {
				runJob(jobs[0].c, jobs[0].request);
			}
		}
	});
	c.on('end', function () {

	});
	c.on('error', function (err) {

	});
}

var port = 8888;
var configpath = "config.json"
var jobs = [];

if (process.argv.indexOf("-c") != -1) {
	port = parseInt(process.argv[process.argv.indexOf("-c") + 1]);
} else if (process.argv.indexOf("--config") != -1) {
	port = parseInt(process.argv[process.argv.indexOf("--config") + 1]);
}

var config = JSON.parse(fs.readFileSync(configpath));

if (process.argv.indexOf("-l") != -1) {
	port = parseInt(process.argv[process.argv.indexOf("-l") + 1]);
} else if (process.argv.indexOf("--listen") != -1) {
	port = parseInt(process.argv[process.argv.indexOf("--listen") + 1]);
} else if (config.port != undefined) {
	port = config.port;
}

if (fs.existsSync("./data.json")) {
	transfer(config.datadir);
}

var map = new Map();
load(map, config.datadir);
net.createServer(serverListener).listen(port);
