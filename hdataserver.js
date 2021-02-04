process.on('uncaughtException', function (err) {
	console.log(err);
	if (!(fs.existsSync("./logs"))) {
		fs.mkdirSync("logs");
	}
	fs.appendFileSync("./logs/error.log", "[" + new Date().getTime() + "] " + err.toString() + "\n");
});

const net = require('net');
const crypto = require('crypto');
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

function load(map, authmap, datadir, since) {
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
				case "createuser":
					authmap.set(tmpdata.user, tmpdata.content);
					break;
				case "deleteuser":
					authmap.delete(tmpdata.user);
					break;
				case "updateuser":
					var tmpuser = authmap.get(tmpdata.user);
					tmpuser[tmpdata.property] = tmpdata.content;
					authmap.set(tmpdata.user, tmpuser);
					break;
				case "createtable":
					var tmpmap = new Map();
					map.set(tmpdata.table, tmpmap);
					break;
				case "deletetable":
					for (var tmpuser in authmap) {
						var i = authmap[tmpuser].tables.indexOf(tmpdata.table);
						if (i != -1) {
							var tmp = authmap[tmpuser];
							tmp.tables.splice(i, 1);
							authmap.set(tmpuser, tmp);
						}
					}
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
			//try {fs.unlinkSync(datadir+"/"+i);} catch(err) {}
		}
	}
	var now = new Date();
	console.log("Database rebuilt in "+((now-then)/1000)+" seconds using "+(dir.length-(since-1))+" records");
}

function writeEnc(key, c, msg) {
	var tmp = [];
	for (var i = 0; i < Math.ceil(msg.length/128); i++) {
		tmp.push(msg.substring(i*128, i*128+128));
	}
	for (var i in tmp) {
		c.write(crypto.publicEncrypt(key, tmp[i]));
	}
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

function runJob(c, request, username, userpub) {
	var user = authmap.get(username);
	switch (request.cmd) {
		default:
			break;
		case "status":
			writeEnc(userpub, c, "{\"status\":\"OK\",\"jobs\":\"" + jobs.length + "\",\"tables\":\"" + map.size + "\"}\n");
			break;
		case "save":
			writeEnc(userpub, c, "{\"status\":\"OK\"}\n");
			break;
		case "createuser":
			if (user.permissions.indexOf("createuser") != -1) {
				if (!authmap.has(request.user)) {
					var good = true;
					for (var p = 0; p < request.permissions.length && good; p++) {
						if (user.permissions.indexOf(request.permissions[p]) == -1) {
							good = false;
						}
					}
					if (good) {
						request.passsalt = crypto.randomBytes(25).toString('hex');
						request.passhash = crypto.pbkdf2Sync(request.password,request.passsalt,100000,512,'sha512').toString('hex');
						delete request.password;
						var tmpuser = {passhash: request.passhash, passsalt: request.passsalt, permissions: request.permissions, tables: []};
						authmap.set(request.user, tmpuser);
						transact({...request, content: tmpuser}, config.datadir);
						writeEnc(userpub, c, "{\"status\":\"OK\"}\n");
					} else {
						writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
					}
				} else {
					writeEnc(userpub, c, "{\"status\":\"UE\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
			}
			break;
		case "deleteuser":
			if (user.permissions.indexOf("deleteuser") != -1 && request.user != "root") {
				if (authmap.has(request.user)) {
					authmap.delete(request.user);
					transact(request, config.datadir);
					writeEnc(userpub, c, "{\"status\":\"OK\"}\n");
				} else {
					writeEnc(userpub, c, "{\"status\":\"UDNE\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
			}
			break;
		case "updateuser":
			if (user.permissions.indexOf("updateuser") != -1) {
				if (authmap.has(request.user)) {
					var tmpuser = authmap.get(request.user);
					tmpuser[request.property] = request.content;
					authmap.set(request.user, tmpuser);
					transact(request, config.datadir);
					writeEnc(userpub, c, "{\"status\":\"OK\"}\n");
				} else {
					writeEnc(userpub, c, "{\"status\":\"UDNE\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
			}
			break;
		case "updatepassword":
			var good = true;
			if (request.user == "") {request.user = username;}
			if (user.permissions.indexOf("updateuser") == -1 && request.user != username) {
				good = false;
			}
			if (good) {
				if (authmap.has(request.user)) {
					request.passsalt = crypto.randomBytes(25).toString('hex');
					request.passhash = crypto.pbkdf2Sync(request.password,request.passsalt,100000,512,'sha512').toString('hex');
					delete request.password;
					var tmpuser = authmap.get(request.user);
					tmpuser.passhash = request.passhash;
					tmpuser.passsalt = request.passsalt;
					authmap.set(request.user, tmpuser);
					transact({cmd:"updateuser",user:request.user,property:"passhash",content:request.passhash}, config.datadir);
					transact({cmd:"updateuser",user:request.user,property:"passsalt",content:request.passsalt}, config.datadir);
					writeEnc(userpub, c, "{\"status\":\"OK\"}\n");
				} else {
					writeEnc(userpub, c, "{\"status\":\"UDNE\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
			}
			break;
		case "createtable":
			if (user.permissions.indexOf("createtable") != -1) {
				if (map.has(request.table)) {
					writeEnc(userpub, c, "{\"status\":\"TE\"}\n");
				} else {
					var tmpmap = new Map();
					map.set(request.table, tmpmap);
					user.tables.push(request.table);
					authmap.set(username, user);
					if (username != "root") {
						var tmp2 = authmap.get("root");
						tmp2.tables.push(request.table);
					}
					transact(request, config.datadir);
					transact({"cmd":"updateuser","user":username,"property":"tables","content":user.tables}, config.datadir);
					if (username != "root") {
						var tmp2 = authmap.get("root").tables;
						tmp2.push(request.table);
						transact({"cmd":"updateuser","user":"root","property":"tables","content":tmp2}, config.datadir);
					}
					writeEnc(userpub, c, "{\"status\":\"OK\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
			}
			break;
		case "deletetable":
			if (map.has(request.table)) {
				if (user.permissions.indexOf("deletetable") != -1 && user.tables.indexOf(request.table) != -1) {
					map.delete(request.table);
					for (var tmpuser in authmap) {
						var i = authmap[tmpuser].tables.indexOf(request.table);
						if (i != -1) {
							var tmp = authmap[tmpuser];
							tmp.tables.splice(i, 1);
							authmap.set(tmpuser, tmp);
						}
					}
					transact(request, config.datadir);
					writeEnc(userpub, c, "{\"status\":\"OK\"}\n");
				} else {
					writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"TDNE\"}\n");
			}
			break;
		case "getkey":
			if (map.has(request.table)) {
				var tmpmap = map.get(request.table);
				if (tmpmap.has(request.key)) {
					if (user.permissions.indexOf("getkey") != -1 && user.tables.indexOf(request.table) != -1) {
						writeEnc(userpub, c, JSON.stringify(tmpmap.get(request.key)) + "\n");
					} else {
						writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
					}
				} else {
					writeEnc(userpub, c, "{\"status\":\"KDNE\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"TDNE\"}\n");
			}
			break;
		case "setkey":
			if (map.has(request.table)) {
				if (user.permissions.indexOf("setkey") != -1 && user.tables.indexOf(request.table) != -1) {
					var tmpmap = map.get(request.table);
					tmpmap.set(request.key, request.content);
					transact(request, config.datadir);
					writeEnc(userpub, c, "{\"status\":\"OK\"}\n");
				} else {
					writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"TDNE\"}\n");
			}
			break;
		case "deletekey":
			if (map.has(request.table)) {
				if (tmpmap.has(request.key)) {
					var tmpmap = map.get(request.table);
					if (user.permissions.indexOf("deletekey") != -1 && user.tables.indexOf(request.table) != -1) {
						tmpmap.delete(request.key, request.value);
						transact(request, config.datadir);
						writeEnc(userpub, c, "{\"status\":\"OK\"}\n");
					} else {
						writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
					}
				} else {
					writeEnc(userpub, c, "{\"status\":\"KDNE\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"TDNE\"}\n");
			}
			break;
		case "queryall":
			if (user.permissions.indexOf("getkey") != -1) {
				var response = { "status": "OK", "matches": [] };
				for (const [table, tmpmap] of map.entries()) {
					if (user.tables.indexOf(request.table) != -1) {
						for (const [key, value] of tmpmap.entries()) {
							var ctx = vm.createContext({ "table": request.table, "key": key, "value": value, "evaluator": request.evaluator });
							try {
								if (vm.runInContext('eval(evaluator);', ctx)) {
									response.matches.push({ "table": table, "key": key, "value": value });
								}
							} catch(err) {}
						}
					}
				}
				writeEnc(userpub, c, JSON.stringify(response) + "\n");
			} else {
				writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
			}
			break;
		case "querytable":
			if (map.has(request.table)) {
				if (user.permissions.indexOf("getkey") != -1 && user.tables.indexOf(request.table) != -1) {
					var response = {"status":"OK","matches":[]};
					var tmpmap = map.get(request.table);
					for (const [key, value] of tmpmap.entries()) {
						var ctx = vm.createContext({ "table": request.table, "key": key, "value": value, "evaluator": request.evaluator });
						if (vm.runInContext('eval(evaluator);', ctx)) {
							response.matches.push({"table":request.table,"key":key,"value":value});
						}
					}
					writeEnc(userpub, c, JSON.stringify(response)+"\n");
				} else {
					writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"TDNE\"}\n");
			}
			break;
		case "tableexists":
			if (user.permissions.indexOf("getkey") != -1) {
				if (map.has(request.table)) {
					writeEnc(userpub, c, "true\n");
				} else {
					writeEnc(userpub, c, "false\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
			}
			break;
		case "tablesize":
			if (map.has(request.table)) {
				if (user.permissions.indexOf("getkey") != -1 && user.tables.indexOf(request.table) != -1) {
					var tmpmap = map.get(request.table);
					writeEnc(userpub, c, "{\"status\":\"OK\",\"size\":"+tmpmap.size+"}\n");
				} else {
					writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"TDNE\"}\n");
			}
			break;
		case "tablekeys":
			if (map.has(request.table)) {
				if (user.permissions.indexOf("getkey") != -1 && user.tables.indexOf(request.table) != -1) {
					var tmpmap = map.get(request.table);
					writeEnc(userpub, c, "{\"status\":\"OK\",\"keys\":"+JSON.stringify(Array.from(tmpmap.keys()))+"}\n");
				} else {
					writeEnc(userpub, c, "{\"status\":\"TDNE\"}\n");
					writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"TDNE\"}\n");
			}
			break;
	}
	//c.end();
	jobs.shift();
	if (jobs.length > 0) {
		runJob(jobs[0].c, jobs[0].request, jobs[0].user, jobs[0].userpub);
	}
}

function serverListener(c) {
	var buffer = "";
	var userpub = "";
	var user = undefined;
	var username = undefined;
	c.on('data', function (data) {
		for (var i = 0; i < Math.ceil(data.length/512); i++) {
			var tmp = data.slice(i*512, i*512+512);
			buffer += crypto.privateDecrypt(privkey, tmp).toString();
		}
		if (userpub == "") {
			if (buffer.endsWith("\n")) {
				userpub = buffer;
				buffer = "";
			}
		} else {
			if (buffer.endsWith("}\n")) {
				var request = JSON.parse(buffer);
				buffer = "";
				if (request.cmd == "status") {
					writeEnc(userpub, c, "{\"status\":\"OK\",\"jobs\":\"" + jobs.length + "\",\"tables\":\"" + map.size + "\"}\n");
					//c.end();
				} else if (request.cmd == "login") {
					if (user == undefined) {
						var tmpuser = authmap.get(request.user);
						if (tmpuser != undefined && crypto.pbkdf2Sync(request.password,tmpuser.passsalt,100000,512,'sha512').toString('hex') == tmpuser.passhash) {
							username = request.user;
							user = tmpuser;
							writeEnc(userpub, c, '{"status":"OK"}\n');
						} else {
							writeEnc(userpub, c, '{"status":"AERR"}\n');
						}
					} else {
						writeEnc(userpub, c, '{"status":"LI"}\n');
					}
				} else if (request.cmd == "logout") {
					if (user != undefined) {
						user = undefined;
						writeEnc(userpub, c, '{"status":"OK"}\n');
					} else {
						writeEnc(userpub, c, '{"status":"NLI"}\n');
					}
				} else {
					if (user != undefined) {
						jobs.push({ "c": c, "request": request, "user": username, "userpub": userpub });
						if (jobs.length == 1) {
							runJob(jobs[0].c, jobs[0].request, jobs[0].user, jobs[0].userpub);
						}
					} else {
						writeEnc(userpub, c, '{"status":"NLI"}\n');
					}
				}
			}
		}
	});
	c.on('end', function () {

	});
	c.on('error', function (err) {

	});
	c.write(pubkey+"\n");
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
var authmap = new Map();
var randomSalt = crypto.randomBytes(25).toString('hex');
authmap.set("root",{"passhash": crypto.pbkdf2Sync('changeme',randomSalt,100000,512,'sha512').toString('hex'), "passsalt": randomSalt, "permissions": ["createtable", "getkey", "setkey", "deletekey", "deletetable", "createuser", "deleteuser", "updateuser"], "tables": []});
load(map, authmap, config.datadir);
var privkey = "";
var pubkey = "";
if (fs.existsSync("./priv.pem") && fs.existsSync("./pub.pem")) {
	privkey = fs.readFileSync('./priv.pem', 'utf8');
	pubkey = fs.readFileSync('./pub.pem', 'utf8');
} else {
	var keys = crypto.generateKeyPairSync('rsa', {
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
	privkey = keys.privateKey;
	pubkey = keys.publicKey;
	fs.writeFileSync('./priv.pem', privkey, 'utf8');
	fs.writeFileSync('./pub.pem', pubkey, 'utf8');
}
net.createServer(serverListener).listen(port);