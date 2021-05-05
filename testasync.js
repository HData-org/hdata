const HData = require('./hdata.js').HData;
const conn = new HData();
async function bruh() {
	console.log(await conn.promises.status());
	console.log(await conn.promises.login("root", "changeme"));
	console.log(await conn.promises.createUser("herronjo", "password", ["getkey"]));
	console.log(await conn.promises.getUser("herronjo"));
	console.log(await conn.promises.updateUser("herronjo", "awesome", true));
	console.log(await conn.promises.getUser("herronjo"));
	console.log(await conn.promises.updatePassword("herronjo", "password2"));
	console.log(await conn.promises.deleteUser("herronjo"));
	console.log(await conn.promises.getUser("herronjo"));
	console.log(await conn.promises.createTable("test"));
	console.log(await conn.promises.setKey("test", "bruh", "moment"));
	console.log(await conn.promises.getKey("test", "bruh"));
	console.log(await conn.promises.queryAll("true"));
	console.log(await conn.promises.getTables());
	console.log(await conn.promises.queryTable("test", "true"));
	console.log(await conn.promises.tableSize("test"));
	console.log(await conn.promises.tableKeys("test"));
	console.log(await conn.promises.deleteKey("test", "bruh"));
	console.log(await conn.promises.getKey("test", "bruh"));
	console.log(await conn.promises.tableExists("test"));
	console.log(await conn.promises.deleteTable("test"));
	console.log(await conn.promises.getKey("test", "bruh"));
	console.log(await conn.promises.logout());
	console.log(await conn.promises.close());
}
bruh();