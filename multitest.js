const HData = require('./hdata.js').HData;
const cluster = require('cluster');
const conn = new HData();

if (cluster.isPrimary) {
	var ready = 0;
	var count = 200;
	async function egg() {
		console.log(`Primary - status - ${JSON.stringify(await conn.promises.status())}`);
		console.log(`Primary - login - ${JSON.stringify(await conn.promises.login("root", "changeme"))}`);
		console.log(`Primary - createtable - ${JSON.stringify(await conn.promises.createTable("test"))}`);
		console.log(`Primary - close - ${JSON.stringify(await conn.promises.close())}`);
		for (var i = 0; i < count; i++) {
			var worker = cluster.fork();
			worker.on('message', function(data) {
				if (data.startsWith("ready")) {
					ready++;
					console.log(`Primary - ${data.split(":")[1]} ready - ${ready} total`);
				}
				if (ready == count) {
					console.log("Primary - It's go time");
					for (var id in cluster.workers) {
						cluster.workers[id].send("go");
					}
				}
			});
		}
	}
	egg();
} else {
	var i = 0;
	async function bruh2() {
		console.log(`${cluster.worker.id} - getkey1 - ${JSON.stringify(await conn.promises.getKey("test", "bruh"))}`);
		console.log(`${cluster.worker.id} - setkey1 - ${JSON.stringify(await conn.promises.setKey("test", "bruh", "moment"))}`);
		console.log(`${cluster.worker.id} - getkey2 - ${JSON.stringify(await conn.promises.getKey("test", "bruh"))}`);
		console.log(`${cluster.worker.id} - setkey2 - ${JSON.stringify(await conn.promises.setKey("test", "bruh", "moment2"))}`);
		console.log(`${cluster.worker.id} - getkey3 - ${JSON.stringify(await conn.promises.getKey("test", "bruh"))}`);
		i++;
		if (i < 10) {
			bruh2();
		} else {
			console.log(`${cluster.worker.id} - logout - ${JSON.stringify(await conn.promises.logout())}`);
			console.log(`${cluster.worker.id} - close - ${JSON.stringify(await conn.promises.close())}`);
			process.exit();
		}
	}
	async function bruh() {
		console.log(`${cluster.worker.id} - Running...`);
		console.log(`${cluster.worker.id} - login - ${JSON.stringify(await conn.promises.login("root", "changeme"))}`);
		process.send(`ready:${cluster.worker.id}`);
	}
	process.on('message', function(data) {
		console.log(`${cluster.worker.id} - Got ${data}`);
		if (data == "go") {
			console.log(`${cluster.worker.id} - Got the signal`);
			bruh2();
		}
	});
	bruh();
}