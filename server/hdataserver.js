#!/usr/bin/env node
"use strict";

process.on('uncaughtException', function (err) {
	console.log(err);
	if (!(fs.existsSync("./logs"))) {
		fs.mkdirSync("logs");
	}
	if (config.logging) fs.appendFileSync("./logs/error.log", "[" + new Date().getTime() + "] " + err.toString() + "\n");
});

const version = "2.2.3";
const net = require('net');
const crypto = require('crypto');
const fs = require('fs');
const fpath = require('path');
const vm = require('vm');
const os = require('os');
const numCpus = os.cpus().length;
const worker_threads = require('worker_threads');
var workers = [];

for (var i = 0; i < numCpus; i++) {
	var worker = new worker_threads.Worker(fpath.dirname(fs.realpathSync(__filename)) + '/query.js', {});
	workers.push(worker);
}

function toTwo(num) {
	var tmp = num.toString();
	while (tmp.length < 2) {
		tmp = "0"+tmp;
	}
	return tmp;
}

function split(arr, num) {
	var returnValue = [];
	var numInEach = arr.length / num;
	var i = 0;
	while (i < arr.length) {
		returnValue.push(arr.slice(i, i += numInEach));
	}
	return returnValue;
}

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
					tmpmap.set(key, tmpdb.db[table][key]);
				}
			}
			if (tmpdb.auth) {
				for (var user in tmpdb.auth) {
					authmap.set(user, tmpdb.auth[user]);
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
					for (var [tmpuser, value] of authmap.entries()) {
						var i2 = value.tables.indexOf(tmpdata.table);
						if (i2 != -1) {
							var tmp = value;
							tmp.tables.splice(i2, 1);
							authmap.set(tmpuser, tmp);
						}
					}
					map.delete(tmpdata.table);
					break;
				case "setkey":
					var tmpmap = map.get(tmpdata.table);
					tmpmap.set(tmpdata.key, tmpdata.content);
					map.set(tmpdata.table, tmpmap); //possibly unnecessary?
					break;
				case "deletekey":
					var tmpmap = map.get(tmpdata.table);
					tmpmap.delete(tmpdata.key);
					map.set(tmpdata.table, tmpmap); //possibly unnecessary?
					break;
				case "setproperty":
					var tmpmap = map.get(tmpdata.table);
					var tmp = tmpmap.get(tmpdata.key);
					function recurse(path, tmp, value) {
						var returnValue;
						if (path.length == 0) {
							returnValue = value;
						} else {
							tmp[path[0]] = recurse(path.slice(1, path.length), tmp[path[0]], value);
							returnValue = tmp;
						}
						return returnValue;
					}
					tmp = recurse(tmpdata.path.split("."), tmp, tmpdata.value);
					tmpmap.set(tmpdata.key, tmp);
					map.set(tmpdata.table, tmpmap); //possibly unnecessary?
					break;
			}
		} catch(err) {
			allGood = false;
			console.log("Failed to load entry "+i+", database loaded up until failure");
			console.log(err);
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
		c.write(crypto.publicEncrypt(key, Buffer.from(tmp[i])));
	}
}

function transact(request, datadir) {
	var num = fs.readdirSync(datadir).length+1;
	if (fs.existsSync(datadir+"/snapshot")) {
		num--;
	}
	fs.writeFileSync(datadir + "/" + num, JSON.stringify(request));
	if (num % (config.snapshotFrequency || 20000) == 0) {
		var tmpdb = {"upTo": num, "db": {}, "auth": {}};
		map.forEach(function(tmpmap, table) {
			tmpdb.db[table] = {};
			tmpmap.forEach(function(value, key) {
				tmpdb.db[table][key] = value;
			});
		});
		authmap.forEach(function(value, key) {
			tmpdb.auth[key] = value;
		});
		fs.writeFileSync(config.datadir+"/snapshot", JSON.stringify(tmpdb));
	}
}

function runJob(c, request, username, userpub) {
	var user = authmap.get(username);
	var date = new Date();
	if (!Array.isArray(user.permissions)) {
		user.permissions = [];
	}
	if (!(fs.existsSync("./logs"))) {
		fs.mkdirSync("logs");
	}
	if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", `[${toTwo(date.getUTCHours())}:${toTwo(date.getUTCMinutes())}:${toTwo(date.getUTCSeconds())}] ${c.remoteAddress} ${username} ${request.cmd}`);
	switch (request.cmd) {
		default:
			break;
		case "status":
			writeEnc(userpub, c, "{\"status\":\"OK\",\"version\":\"" + version + "\",\"jobs\":\"" + jobs.length + "\",\"tables\":\"" + map.size + "\",\"host\":\"" + os.hostname() + "\",\"port\":\"" + port + "\"}\n");
			break;
		case "createuser":
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.user}`);
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
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.user}`);
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
		case "getuser":
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.user}`);
			if (user.permissions.indexOf("updateuser") != -1) {
				if (authmap.has(request.user)) {
					var tmpuser = JSON.parse(JSON.stringify(authmap.get(request.user)));
					delete tmpuser.passhash;
					delete tmpuser.passsalt;
					writeEnc(userpub, c, JSON.stringify({status:"OK",value:tmpuser})+"\n");
				} else {
					writeEnc(userpub, c, "{\"status\":\"UDNE\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
			}
			break;
		case "updateuser":
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.user} ${request.property}`);
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
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.user}`);
			var good = true;
			if (request.user == "" || request.user == undefined) {request.user = username;}
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
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.table}`);
			if (user.permissions.indexOf("createtable") != -1) {
				if (map.has(request.table)) {
					writeEnc(userpub, c, "{\"status\":\"TE\"}\n");
				} else {
					var tmpmap = new Map();
					map.set(request.table, tmpmap);
					user.tables.push(request.table);
					authmap.set(username, user);
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
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.table}`);
			if (map.has(request.table)) {
				if (user.permissions.indexOf("deletetable") != -1 && user.tables.indexOf(request.table) != -1) {
					map.delete(request.table);
					for (var [tmpuser, value] of authmap.entries()) {
						var i = value.tables.indexOf(request.table);
						if (i != -1) {
							var tmp = value;
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
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.table} ${request.key}`);
			if (map.has(request.table)) {
				if (user.permissions.indexOf("getkey") != -1 && user.tables.indexOf(request.table) != -1) {
					var tmpmap = map.get(request.table);
					if (tmpmap.has(request.key)) {
						writeEnc(userpub, c, JSON.stringify({status:"OK",value:tmpmap.get(request.key)}) + "\n");
					} else {
						writeEnc(userpub, c, "{\"status\":\"KDNE\"}\n");
					}
				} else {
					writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"TDNE\"}\n");
			}
			break;
		case "setkey":
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.table} ${request.key}`);
			if (map.has(request.table)) {
				if (user.permissions.indexOf("setkey") != -1 && user.tables.indexOf(request.table) != -1) {
					var tmpmap = map.get(request.table);
					tmpmap.set(request.key, request.content);
					map.set(request.table, tmpmap); //possibly unnecessary?
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
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.table} ${request.key}`);
			if (map.has(request.table)) {
				var tmpmap = map.get(request.table);
				if (tmpmap.has(request.key)) {
					if (user.permissions.indexOf("deletekey") != -1 && user.tables.indexOf(request.table) != -1) {
						tmpmap.delete(request.key, request.value);
						map.set(request.table, tmpmap); //possibly unnecessary?
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
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.evaluator}`);
			if (user.permissions.indexOf("getkey") != -1) {
				//var ctx = vm.createContext({"evaluator": request.evaluator});
				var response = { "status": "OK", "matches": [] };
				var keys = user.tables;
				var finished = 0;
				function queryTable(tablei) {
					var table = keys[tablei];
					var tmpmap = map.get(table);
					var splitEntries = split(Array.from(tmpmap.entries()), numCpus);
					var tfinished = 0;
					for (var i = 0; i < numCpus; i++) {
						workers[i].postMessage({table: request.table, evaluator: request.evaluator, entries: splitEntries[i], i: i});
						function wlisten(wdata) {
							if (wdata.type == "result") {
								response.matches.push({"table": request.table, "key": wdata.result, "value": tmpmap.get(wdata.result)});
							} else if (wdata.type == "finished") {
								tfinished++;
								if (tfinished == numCpus) {
									finished++;
									if (finished == keys.length) {
										writeEnc(userpub, c, JSON.stringify(response) + "\n");
									} else {
										queryTable(tablei + 1);
									}
								}
								workers[wdata.i].removeListener('message', wlisten);
							}
						}
						workers[i].addListener('message', wlisten);
					}
				}
				if (keys.length > 0) {
					queryTable(0);
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
			}
			break;
		case "querytable":
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.table} ${request.evaluator}`);
			if (map.has(request.table)) {
				if (user.permissions.indexOf("getkey") != -1 && user.tables.indexOf(request.table) != -1) {
					var response = {"status":"OK","matches":[]};
					var tmpmap = map.get(request.table);
					var splitEntries = split(Array.from(tmpmap.entries()), numCpus);
					var tfinished = 0;
					for (var i = 0; i < numCpus; i++) {
						workers[i].postMessage({table: request.table, evaluator: request.evaluator, entries: splitEntries[i], i: i});
						function wlisten(wdata) {
							if (wdata.type == "result") {
								response.matches.push({"table": request.table, "key": wdata.result, "value": tmpmap.get(wdata.result)});
							} else if (wdata.type == "finished") {
								tfinished++;
								if (tfinished == numCpus) {
									writeEnc(userpub, c, JSON.stringify(response) + "\n");
								}
								workers[wdata.i].removeListener('message', wlisten);
							}
						}
						workers[i].addListener('message', wlisten);
					}
				} else {
					writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"TDNE\"}\n");
			}
			break;
		case "tableexists":
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.table}`);
			if (user.permissions.indexOf("getkey") != -1) {
				if (map.has(request.table)) {
					writeEnc(userpub, c, "{\"status\":\"OK\",\"value\":true}\n");
				} else {
					writeEnc(userpub, c, "{\"status\":\"OK\",\"value\":false}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
			}
			break;
		case "tablesize":
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.table}`);
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
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.table}`);
			if (map.has(request.table)) {
				if (user.permissions.indexOf("getkey") != -1 && user.tables.indexOf(request.table) != -1) {
					var tmpmap = map.get(request.table);
					writeEnc(userpub, c, "{\"status\":\"OK\",\"keys\":"+JSON.stringify(Array.from(tmpmap.keys()))+"}\n");
				} else {
					writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"TDNE\"}\n");
			}
			break;
		case "gettables":
			var list = user.tables;
			writeEnc(userpub, c, JSON.stringify({status:"OK",value:list})+"\n");
			break;
		case "getproperty":
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.table} ${request.key} ${request.path}`);
			var path = request.path.split(".");
			if (map.has(request.table)) {
				if (user.permissions.indexOf("getkey") != -1 && user.tables.indexOf(request.table) != -1) {
					var tmpmap = map.get(request.table);
					if (tmpmap.has(request.key)) {
						var tmp = tmpmap.get(request.key);
						if (typeof tmp == "object") {
							var good = true;
							for (var i = 0; i < path.length && good; i++) {
								if (tmp[path[i]] != undefined) {
									tmp = tmp[path[i]];
								} else {
									good = false;
								}
							}
							if (good) {
								writeEnc(userpub, c, JSON.stringify({status:"OK",value:tmp})+"\n");
							} else {
								writeEnc(userpub, c, "{\"status\":\"EVERR\"}\n");
							}
						} else {
							writeEnc(userpub, c, "{\"status\":\"EVERR\"}\n");
						}
					} else {
						writeEnc(userpub, c, "{\"status\":\"KDNE\"}\n");
					}
				} else {
					writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"TDNE\"}\n");
			}
			break;
		case "setproperty":
			if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", ` ${request.table} ${request.key} ${request.path}`);
			var path = request.path.split(".");
			if (map.has(request.table)) {
				if (user.permissions.indexOf("getkey") != -1 && user.tables.indexOf(request.table) != -1) {
					var tmpmap = map.get(request.table);
					if (tmpmap.has(request.key)) {
						var tmp = tmpmap.get(request.key);
						if (typeof tmp == "object") {
							var good = true;
							for (var i = 0; i < path.length && good; i++) {
								if (tmp[path[i]] != undefined) {
									tmp = tmp[path[i]];
								} else {
									good = false;
								}
							}
							if (good) {
								var tmp = tmpmap.get(request.key);
								function recurse(path, tmp, value) {
									var returnValue;
									if (path.length == 0) {
										returnValue = value;
									} else {
										tmp[path[0]] = recurse(path.slice(1, path.length), tmp[path[0]], value);
										returnValue = tmp;
									}
									return returnValue;
								}
								tmp = recurse(path, tmp, request.value);
								tmpmap.set(request.key, tmp);
								map.set(request.table, tmpmap); //possibly unnecessary?
								transact(request, config.datadir);
								writeEnc(userpub, c, "{\"status\":\"OK\"}\n");
							} else {
								writeEnc(userpub, c, "{\"status\":\"EVERR\"}\n");
							}
						} else {
							writeEnc(userpub, c, "{\"status\":\"EVERR\"}\n");
						}
					} else {
						writeEnc(userpub, c, "{\"status\":\"KDNE\"}\n");
					}
				} else {
					writeEnc(userpub, c, "{\"status\":\"PERR\"}\n");
				}
			} else {
				writeEnc(userpub, c, "{\"status\":\"TDNE\"}\n");
			}
			break;
	}
	if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", `\r\n`);
	jobs.shift();
	if (jobs.length > 0) {
		runJob(jobs[0].c, jobs[0].request, jobs[0].user, jobs[0].userpub);
	}
}

function serverListener(c) {
	var hashWorker = new worker_threads.Worker(fpath.dirname(fs.realpathSync(__filename)) + '/hash.js', {});
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
				writeEnc(userpub, c, "\n");
			}
		} else {
			if (buffer.endsWith("}\n")) {
				var request = JSON.parse(buffer);
				buffer = "";
				if (request.cmd == "status") {
					writeEnc(userpub, c, "{\"status\":\"OK\",\"version\":\"" + version + "\",\"jobs\":\"" + jobs.length + "\",\"tables\":\"" + map.size + "\",\"host\":\"" + os.hostname() + "\",\"port\":\"" + port + "\"}\n");
					var date = new Date();
					if (!(fs.existsSync("./logs"))) {
						fs.mkdirSync("logs");
					}
					if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", `[${toTwo(date.getUTCHours())}:${toTwo(date.getUTCMinutes())}:${toTwo(date.getUTCSeconds())}] ${c.remoteAddress} ${username || c.remoteAddress} ${request.cmd}\r\n`);
				} else if (request.cmd == "login") {
					var date = new Date();
					if (!(fs.existsSync("./logs"))) {
						fs.mkdirSync("logs");
					}
					if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", `[${toTwo(date.getUTCHours())}:${toTwo(date.getUTCMinutes())}:${toTwo(date.getUTCSeconds())}] ${c.remoteAddress} ${request.cmd} ${request.user}`);
					if (user == undefined) {
						var tmpuser = authmap.get(request.user);
						if (tmpuser != undefined) {
							function auth(data) {
								if (data) {
									username = request.user;
									user = tmpuser;
									writeEnc(userpub, c, '{"status":"OK"}\n');
									if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", " succeeded\r\n");
								} else {
									writeEnc(userpub, c, '{"status":"AERR"}\n');
									if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", " failed\r\n");
								}
								hashWorker.removeListener('message', auth);
							}
							hashWorker.on('message', auth);
							hashWorker.postMessage({password: request.password, passsalt: tmpuser.passsalt, passhash: tmpuser.passhash});
						} else {
							writeEnc(userpub, c, '{"status":"AERR"}\n');
							if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", " failed\r\n");
						}
					} else {
						writeEnc(userpub, c, '{"status":"LI"}\n');
						if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", " failed\r\n");
					}
				} else if (request.cmd == "logout") {
					var date = new Date();
					if (!(fs.existsSync("./logs"))) {
						fs.mkdirSync("logs");
					}
					if (config.logging) fs.appendFileSync("logs/"+date.getUTCFullYear()+"-"+date.getUTCDate()+"-"+(date.getUTCMonth()+1)+".log", `[${toTwo(date.getUTCHours())}:${toTwo(date.getUTCMinutes())}:${toTwo(date.getUTCSeconds())}] ${c.remoteAddress} ${username || c.remoteAddress} ${request.cmd}\r\n`);
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

var config = {"port":8888, "datadir": "./data", "snapshotFrequency": 20000, "logging": true};

if (fs.existsSync(configpath)) {
	config = JSON.parse(fs.readFileSync(configpath));
	if (config.logging == undefined) {
		config.logging = true;
	}
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