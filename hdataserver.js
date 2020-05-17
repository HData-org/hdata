process.on('uncaughtException', function(err) {
	console.log(err);
	fs.appendFileSync("./logs/error.log", "["+new Date().getTime()+"] "+err.toString()+"\n");
});

process.on("SIGINT", function() {
	console.log("Saving before shutting down...");
	if (saveTimeout != undefined) {clearInterval(saveTimeout);}
	save();
	process.exit();
});

const net = require('net');
const fs = require('fs');
var keyschanged = 0;
var cursavetime = 0;
var jobs = [];

var adata = {}

if (!(fs.existsSync("./logs"))) {
	fs.mkdirSync("logs");
}
if (fs.existsSync("./data.json")) {
	adata = JSON.parse(fs.readFileSync("./data.json"));
} else {
	fs.writeFileSync("./data.json", JSON.stringify(adata));
}

function save() {
	fs.writeFileSync("./data.json", JSON.stringify(adata));
	keyschanged = 0;
	cursavetime = 0;
	saveTimeout = undefined;
	console.log("Saved.");
}

var saveTimeout = undefined;

function incChanged() {
	keyschanged++;
	if (keyschanged >= 1 && keyschanged < 20) {
		if (saveTimeout == undefined) {
			saveTimeout = setTimeout(save, 360000);
			cursavetime = 360000;
		} else if (cursavetime > 360000) {
			clearTimeout(saveTimeout);
			saveTimeout = setTimeout(save, 360000);
			cursavetime = 360000;
		}
	} else if (keyschanged >= 20 && keyschanged < 50) {
		if (saveTimeout == undefined) {
			saveTimeout = setTimeout(save, 60000);
			cursavetime = 60000;
		} else if (cursavetime > 60000) {
			clearTimeout(saveTimeout);
			saveTimeout = setTimeout(save, 60000);
			cursavetime = 60000;
		}
	} else if (keyschanged >= 50 && keyschanged < 100) {
		if (saveTimeout == undefined) {
			saveTimeout = setTimeout(save, 30000);
			cursavetime = 30000;
		} else if (cursavetime > 30000) {
			clearTimeout(saveTimeout);
			saveTimeout = setTimeout(save, 30000);
			cursavetime = 30000;
		}
	} else if (keyschanged >= 100 && keyschanged < 500) {
		if (saveTimeout == undefined) {
			saveTimeout = setTimeout(save, 15000);
			cursavetime = 15000;
		} else if (cursavetime > 15000) {
			clearTimeout(saveTimeout);
			saveTimeout = setTimeout(save, 15000);
			cursavetime = 15000;
		}
	} else if (keyschanged >= 500 && keyschanged < 1000) {
		if (saveTimeout == undefined) {
			saveTimeout = setTimeout(save, 1000);
			cursavetime = 1000;
		} else if (cursavetime > 1000) {
			clearTimeout(saveTimeout);
			saveTimeout = setTimeout(save, 1000);
			cursavetime = 1000;
		}
	} else if (keyschanged >= 1000) {
		clearTimeout(saveTimeout);
		save();
	}
}

function runJob(c, cmdtmp) {
	switch (cmdtmp.cmd) {
		default:
		case "":
		case "status":
			c.write("{\"status\":\"OK\",\"jobs\":\""+jobs.length+"\",\"keyschanged\":\""+keyschanged+"\"}\n");
			break;
		case "createtable":
			if (adata[cmdtmp.table] == undefined) {
				adata[cmdtmp.table] = {};
				incChanged();
				c.write("{\"status\":\"OK\"}\n");
			} else {
				c.write("{\"status\":\"TE\"}\n");
			}
			break;
		case "deletetable":
			if (adata[cmdtmp.table] != undefined) {
				delete adata[cmdtmp.table];
				incChanged();
				c.write("{\"status\":\"OK\"}\n");
			} else {
				c.write("{\"status\":\"TDNE\"}\n");
			}
			break;
		case "getkey":
			if (adata[cmdtmp.table] != undefined) {
				if (adata[cmdtmp.table][cmdtmp.key] != undefined) {
					c.write(JSON.stringify(adata[cmdtmp.table][cmdtmp.key])+"\n");
				} else {
					c.write("{\"status\":\"KDNE\"}\n");
				}
			} else {
				c.write("{\"status\":\"TDNE\"}\n");
			}
			break;
		case "setkey":
			if (adata[cmdtmp.table] != undefined) {
				adata[cmdtmp.table][cmdtmp.key] = cmdtmp.content;
				incChanged();
				c.write("{\"status\":\"OK\"}\n");
			} else {
				c.write("{\"status\":\"TDNE\"}\n");
			}
			break;
		case "deletekey":
			if (adata[cmdtmp.table] != undefined) {
				if (adata[cmdtmp.table][cmdtmp.key] != undefined) {
					delete adata[cmdtmp.table][cmdtmp.key];
					incChanged();
					c.write("{\"status\":\"OK\"}\n");
				} else {
					c.write("{\"status\":\"KDNE\"}\n");
				}
			} else {
				c.write("{\"status\":\"TDNE\"}\n");
			}
			break;
		case "save":
			save();
			c.write("{\"status\":\"OK\"}\n");
			break;
	}
	c.end();
	jobs.shift();
	if (jobs.length > 0) {
		runJob(jobs[0].c,jobs[0].cmdtmp);
	}
}

var server = net.createServer(function(c) {
	var buf = "";
	c.on('data', function(data) {
		buf += data.toString();
		if (buf.endsWith("\n")) {
			try {
				var cmdtmp = JSON.parse(buf);
				jobs.push({"c":c,"cmdtmp":cmdtmp});
				if (jobs.length == 1) {
					runJob(jobs[0].c,jobs[0].cmdtmp);
				}
			} catch(err) {
				c.write("{\"status\":\"ERR\"}\n");
				c.end();
			}
		}
	});
});

var port = 8888;

if (process.argv.indexOf("-l") != -1) {
	port = parseInt(process.argv[process.argv.indexOf("-l")+1]);
} else if (process.argv.indexOf("--listen") != -1) {
	port = parseInt(process.argv[process.argv.indexOf("--listen")+1]);
}

server.listen(port);
console.log("HData server listening on "+port);
