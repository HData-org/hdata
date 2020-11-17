process.on('uncaughtException', function (err) {
	console.log(err);
	if (!(fs.existsSync("./logs"))) {
		fs.mkdirSync("logs");
	}
	fs.appendFileSync("./logs/error.log", "[" + new Date().getTime() + "] " + err.toString() + "\n");
});

const net = require('net');
const fs = require('fs');
const vm = require('vm');

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
	since = since || 1;
	console.log("Rebuilding database");
	var then = new Date();
	if (!fs.existsSync(datadir)) {
		fs.mkdirSync(datadir);
	}
	var dir = fs.readdirSync(datadir);
	var count = dir.length;
	if (dir.indexOf("snapshot") != -1) {
		var originalSince = since;
		try {
			count--;
			var tmpdb = JSON.parse(fs.readFileSync(datadir+"/snapshot"));
			since = tmpdb.upTo+1;
			console.log("Loading snapshot from "+tmpdb.upTo);
			for (var table in tmpdb.db) {
				var tmpmap = new Map();
				map.set(table, tmpmap);
				for (var key in tmpdb.db[table]) {
					tmpmap.set(key, tmpdb.db[table]);
				}
			}
			console.log("Loaded snapshot");
		} catch(err) {
			console.log("Failed to load snapshot");
			map.clear();
			since = originalSince;
			count++;
		}
	}
	var allGood = true;
	for (var i = (since || 1); i <= count && allGood; i++) {
		try {
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
		} catch(err) {
			allGood = false;
			console.log("Failed to load entry "+i+", database loaded up until failure");
			try {fs.unlinkSync(datadir+"/"+i);} catch(err) {}
		}
	}
	var now = new Date();
	console.log("Database rebuilt in "+((now-then)/1000)+" seconds using "+(dir.length-(since-1))+" records");
}

function transact(request, datadir) {
	var num = fs.readdirSync(datadir).length+1;
	if (fs.existsSync(datadir+"/snapshot")) {
		num--;
	}
	fs.writeFileSync(datadir + "/" + num, JSON.stringify(request));
	if (num % (config.snapshotFrequency || 20000) == 0) {
		var tmpdb = {"upTo": num, "db": {}};
		map.forEach(function(tmpmap, table) {
			tmpdb.db[table] = {};
			tmpmap.forEach(function(value, key) {
				tmpdb.db[table][key] = value;
			});
		});
		fs.writeFileSync(config.datadir+"/snapshot", JSON.stringify(tmpdb));
	}
}

function runJob(c, request) {
	switch (request.cmd) {
		default:
			break;
		case "status":
			c.write("{\"status\":\"OK\",\"jobs\":\"" + jobs.length + "\",\"tables\":\"" + map.size + "\"}\n");
			break;
		case "save":
			c.write("{\"status\":\"OK\"}\n");
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
		case "queryall":
			var response = { "status": "OK", "matches": [] };
			for (const [table, tmpmap] of map.entries()) {
				for (const [key, value] of tmpmap.entries()) {
					var ctx = vm.createContext({ "table": request.table, "key": key, "value": value, "evaluator": request.evaluator });
					try {
						if (vm.runInContext('eval(evaluator);', ctx)) {
							response.matches.push({ "table": table, "key": key, "value": value });
						}
					} catch(err) {}
				}
			}
			c.write(JSON.stringify(response) + "\n");
			break;
		case "querytable":
			if (map.has(request.table)) {
				var response = {"status":"OK","matches":[]};
				var tmpmap = map.get(request.table);
				for (const [key, value] of tmpmap.entries()) {
					var ctx = vm.createContext({ "table": request.table, "key": key, "value": value, "evaluator": request.evaluator });
					if (vm.runInContext('eval(evaluator);', ctx)) {
						response.matches.push({"table":request.table,"key":key,"value":value});
					}
				}
				c.write(JSON.stringify(response)+"\n");
			} else {
				c.write("{\"status\":\"TDNE\"}\n");
			}
			break;
		case "tableexists":
			if (map.has(request.table)) {
				c.write("true\n");
			} else {
				c.write("false\n");
			}
			break;
		case "tablesize":
			if (map.has(request.table)) {
				var tmpmap = map.get(request.table);
				c.write("{\"status\":\"OK\",\"size\":"+tmpmap.size+"}\n");
			} else {
				c.write("{\"status\":\"TDNE\"}\n");
			}
			break;
		case "tablekeys":
			if (map.has(request.table)) {
				var tmpmap = map.get(request.table);
				c.write("{\"status\":\"OK\",\"keys\":"+JSON.stringify(Array.from(tmpmap.keys()))+"}\n");
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
			if (request.cmd == "status") {
				c.write("{\"status\":\"OK\",\"jobs\":\"" + jobs.length + "\",\"tables\":\"" + map.size + "\"}\n");
				c.end();
			} else {
				jobs.push({ "c": c, "request": request });
				if (jobs.length == 1) {
					runJob(jobs[0].c, jobs[0].request);
				}
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

var config = {"port":8888, "datadir": "./data", "snapshotFrequency": 20000};

if (fs.readFileSync(configpath)) {
	config = JSON.parse(fs.readFileSync(configpath));
}

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
