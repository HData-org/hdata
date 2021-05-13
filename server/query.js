const worker_threads = require('worker_threads');
worker_threads.parentPort.on('message', function(data) {
	var entries = data.entries;
	var evaluator = data.evaluator;
	for (var i = 0; i < entries.length; i++) {
		var table = data.table;
		var key = entries[i][0];
		var value = entries[i][1];
		var result = false;
		try {
			result = Function(`return (${evaluator})`)();
		} catch(err) {}
		if (result) {
			//worker_threads.parentPort.postMessage({type: "result", result: {"table": table, "key": key, "value": value}});
			worker_threads.parentPort.postMessage({type: "result", result: key});
		}
	}
	worker_threads.parentPort.postMessage({type: "finished", i: data.i});
});