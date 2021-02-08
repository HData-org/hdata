# HData

HData is a JSON database solution written entirely in Node.JS.  It's memory resident and doesn't corrupt with simultanious writes. Reads and writes are executed in the sequence they're requested, so no more wrong values.

Not only that, but you interact with the database entirely in JSON as well! You send queries and commands to the server in JSON, and the server responds in JSON. The data is saved in JSON internally and externally. It's JSON all around!

## Limitations
 * Syncronous, does not use promises

## Documentation

### Creating an HData server

Read [server/README.md](server/README.md)

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
    console.log(`Server has the status: ${res.status}, and has ${res.jobs} pending jobs. ${res.tables} tables exist in the database.`);
});
```

#### conn.login(username, password, callback)
Logs the current HData object in as ``username`` to the server.

```js
conn.login("root", "changeme", function(res, err) {
    if (res.status == "OK") {
        console.log(`Logged in as ${username}!`);
    } else {
        console.log("Invalid username or password");
    }
});
```

### *The following commands require you to be logged in:*

#### conn.logout(callback);
Logs out the current HData object.

```js
conn.logout(function(res, err) {
    console.log("Successfully logged out");
});
```

#### conn.createUser(username, password, permissions, callback)
Creates a user with a the username ``username``, password ``password``, and the permissions given in the ``permissions`` array. (Requires the currently logged in user to have the ``createuser`` permission, and you cannot grant permissions you do not have to this new user).

```js
conn.createUser("testuser", "testpassword", ["getkey","setkey"], function(res, err) {
    if (res.status == "OK") {
        console.log("User created!");
    } else {
        console.log("Insufficient permissions");
    }
});
```

#### conn.deleteUser(username, callback)
Deletes the user specified by ``username``. (Requires the currently logged in user to have the ``deleteuser`` permission).

```js
conn.deleteUser("testuser", function(res, err) {
    if (res.status == "OK") {
        console.log("User deleted!");
    } else {
        console.log("Insufficient permissions");
    }
});
```

#### conn.getUser(username, callback)
Returns an object containing the properties of the user ``username``. (Requires the currently logged in user to have the ``updateuser`` permission).

#### conn.updateUser(username, property, content, callback)
Updates the ``property`` of ``username`` with the value of ``content`` in the authentication database. (Requires the currently logged in user to have the ``updateuser`` permission).

```js
conn.updateUser("testuser", "tables", ["users"], function(res, err) {
    if (res.status == "OK") {
        console.log("User updated!");
    } else {
        console.log("Insufficient permissions");
    }
});
```

#### conn.updatePassword(username, password, callback)
Updates the password of the user ``username`` to ``password``. (Users may update their own passwords without any permissions, however the currently logged in user must have the ``updateuser`` permission to update another user's password).

```js
conn.updatePassword("testuser", "testpasswordtwo", function(res, err) {
    if (res.status == "OK") {
        console.log("Password updated!");
    } else {
        console.log("Insufficient permissions");
    }
});
```

#### conn.createTable(tableName, callback)
Creates a table with the name provided in ``tableName``. Errors if a table of the same name exists. Requires the ``createtable`` permission.

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
Deletes the table with the name provided by ``tableName``. Errors if no table exists with that name. Requires the ``deletetable`` permission and that the user have permissions for the table.

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
Gets the value of the key named ``keyName`` from the table named ``tableName``. Errors if the key or table does not exist. Requires the ``getkey`` permission and that the user have permissions for the table.

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
Sets the value of the key named ``keyName`` from the table named ``tableName`` to the value in ``content``. Errors if the table does not exist. ``content`` can be any type of data that can be stored in JSON. Requires the ``setkey`` permission and that the user have permissions for the table.

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
Deletes the key named ``keyName`` from the table named ``tableName``. Errors if the table or key does not exist. Requries the ``deletekey`` permission and that the user have permissions for the table.

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

#### conn.getTables(callback)
Returns a list of tables (that the user has access to) on the server.

```js
conn.getTables(function(res, err) {
    if (!err) {
        console.log(res); //Should return an array ["table1","table2"]
    } else {
        console.log(err);
    }
});
```

#### conn.queryAll(evaluator, callback)
Queries the database over all tables and keys, matching them against the evaluator specified. Returns all matches, including what table they're in, their values, and the key name.
``evaluator`` is a standard JavaScript evaluator, such as ``key.startsWith("egg") && value.includes("br")``, which would return all keys whose names start with "egg" and have a value containing "br". The following variables exist in the scope the evaluator is evaluated in: ``key``, ``value``, and ``table``, which contain the key name, value of the key, and table the key is in respectively. Requires the ``getkey`` permission. Only queries tables the user has permission to read.

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
``evaluator`` is a standard JavaScript evaluator, such as ``key.startsWith("egg") && value.includes("br")``, which would return all keys whose names start with "egg" and have a value containing "br". The following variables exist in the scope the evaluator is evaluated in: ``key``, ``value``, and ``table``, which contain the key name, value of the key, and table the key is in respectively. Requires the ``getkey`` permission and that the user have permissions for the table.

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
Checks if the table ``tableName`` already exists in the database. Requires the ``getkey`` permission.

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

#### conn.tableSize(tableName, callback)
Returns the number of keys in the table ``tableName``. Requires the ``getkey`` permission and that the user have permissions for the table.

```js
conn.tableSize("table", function(res,err) {
    if (!err) {
        console.log("Table has "+res.size+" keys");
    } else {
        console.log(err);
    }
});
```

#### conn.tableKeys(tableName, callback)
Returns an array of the names of all keys in ``tableName``. Requires the ``getkey`` permission and that the user have permissions for the table.


```js
conn.tableKeys("table", function(res,err) {
    if (!err) {
        console.log("Table has the following keys: "+JSON.stringify(res.keys));
    } else {
        console.log(err);
    }
});
```
