# HData

HData is a JSON database solution written entirely in Node.JS.  It's memory resident and doesn't corrupt with simultanious writes. Reads and writes are executed in the sequence they're requested, so no more wrong values.

Not only that, but you interact with the database entirely in JSON as well! You send queries and commands to the server in JSON, and the server responds in JSON. The data is saved in JSON internally and externally. It's JSON all around!

## Limitations
 * Saving blocks the main thread, so large DBs will slow things down
 * Syncronous, does not use promises

## Documentation

### Creating an HData server
It's as simple as running ``node hdataserver.js`` in the directory.

Data will be saved to a file called "data.json" in the same folder, and logs written to a folder called "logs" also in the same folder.

To listen on a different port, run ``node hdataserver.js -l {PORT}`` or ``node hdataserver.js --listen {PORT}``

### Using the HData Node.JS module

#### Creating an HData connection
To just use the default values (``{"host":"127.0.0.1","port":8888}``):

```js
const HData = require('hdata').HData;
const conn = new HData();
```

By default, HData makes a connection to 127.0.0.1:8888, but options can be passed like so:
```js
const HData = require('hdata').HData;
const options = {
    "host": "example.com",
    "port": 8000
}
const conn = new HData(options);
```

#### conn.status(callback)
Returns the server's status and how many pending jobs it has, including the active one.

```js
conn.status(function(res, err) {
    console.log(`Server has the status: ${res.status}, and has ${res.jobs} pending jobs. ${res.keyschanged} keys have been changed since last save.`);
});
```

#### conn.createTable(tableName, callback)
Creates a table with the name provided in ``tableName``. Errors if a table of the same name exists.

```js
conn.createTable("users", function(res, err) {
    if (!err) {
        if (res.status == "OK") {
            console.log("Table created!");
        } else {
            console.log(JSON.stringify(res));
        }
    } else {
        console.log(err);
    }
});
```

#### conn.deleteTable(tableName, callback)
Deletes the table with the name provided by ``tableName``. Errors if no table exists with that name.

```js
conn.deleteTable("users", function(res,err) {
    if (!err) {
        if (res.status == "OK") {
            console.log("Table deleted!");
        } else {
            console.log(JSON.stringify(res));
        }
    } else {
        console.log(err);
    }
});
```

#### conn.getKey(tableName, keyName, callback)
Gets the value of the key named ``keyName`` from the table named ``tableName``. Errors if the key or table does not exist.

```js
conn.getKey("users", "herronjo", function(res,err) {
    if (!err) {
        console.log(res);
    } else {
        console.log(err);
    }
});
```

#### conn.setKey(tableName, keyName, content, callback)
Sets the value of the key named ``keyName`` from the table named ``tableName`` to the value in ``content``. Errors if the table does not exist. ``content`` can be any type of data that can be stored in JSON.

```js
conn.setKey("users", "herronjo", {isCool:true}, function(res,err) {
    if (!err) {
        console.log(res);
    } else {
        console.log(err);
    }
});
```

#### conn.deleteKey(tableName, keyName, callback)
Deletes the key named ``keyName`` from the table named ``tableName``. Errors if the table or key does not exist.

```js
conn.deleteKey("users", "herronjo", function(res,err) {
    if (!err) {
        if (res.status == "OK") {
            console.log("Key deleted!");
        } else {
            console.log(res);
        }
    } else {
        console.log(err);
    }
});
```

#### conn.queryAll(evaluator, callback)
Queries the database over all tables and keys, matching them against the evaluator specified. Returns all matches, including what table they're in, their values, and the key name.
``evaluator`` is a standard JavaScript evaluator, such as ``key.startsWith("egg") && value.includes("br")``, which would return all keys whose names start with "egg" and have a value containing "br".

```js
conn.queryAll('key.startsWith("egg") && value.includes("br")', function(res,err) {
    if (!err) {
        console.log(res.matches);
    } else {
        console.log(err);
    }
});
```

Returns something like: ``[{"table": "users", "key": "egg123", "value": "bruh moment"},{"table": "users", "key": "eggbot", "value": "bread is cool"}]``

#### conn.queryTable(tableName, evaluator, callback)
Queries the database over just the table ``tableName`` and its keys, matching them against the evaluator specified. Returns all matches, including what table they're in, their values, and the key name.
``evaluator`` is a standard JavaScript evaluator, such as ``key.startsWith("egg") && value.includes("br")``, which would return all keys whose names start with "egg" and have a value containing "br".

```js
conn.queryTable("users", 'key.startsWith("egg") && value.includes("br")', function(res,err) {
    if (!err) {
        console.log(res.matches);
    } else {
        console.log(err);
    }
});
```

Returns something like the above example: ``[{"table": "users", "key": "egg123", "value": "bruh moment"},{"table": "users", "key": "eggbot", "value": "bread is cool"}]``

#### conn.tableExists(tableName, callback)
Checks if the table ``tableName`` already exists in the database.

```js
conn.tableExists("table", function(res,err) {
    if (!err) {
        if (res) {
            console.log("Table exists!");
        } else {
            console.log("Table does not exist");
        }
    } else {
        console.log(err);
    }
});
```
