# HData Server

This folder contains the source code for the HData server, to be used with the HData module.

## Documentation

### Configuration file
The default configuration file ([config.json](config.json)) looks a little something like this:
```json
{
	"port":  8888,
	"datadir": "./data",
	"snapshotFrequency": 20000
}
```
``port`` specifies what port you want the server to listen on. The configuration on the HData module must match this in order to connect.

``datadir`` specifies the directory where all the data should be stored. By default, that's a folder called ``data`` in the same directory as where you ran the server, but it can be changed to a static path.

Finally, ``snapshotFrequency`` specifies after how many records you want the server to take a snapshot. Snapshots help speed up the server's startup times. By default this is set to 20,000 records, but on lower end hardware it's recommended to set this lower.

### Creating an HData server
#### NPM: 
```sh
$ npm install -g hdata-server
$ cd [where you want your data directory to be]
$ hdata-server
```

#### GitHub:
It's as simple as running the following!

```sh
$ git clone https://github.com/herronjo/hdata.git
$ cd hdata/server
$ node hdataserver.js
```

### Other info

Data will be saved into a folder named ``data``, and logs written to a folder called ``logs`` also in the same folder. The data directory can be changed in config.json by chaing the ``datadir`` property.

To listen on a different port, run ``node hdataserver.js -l {PORT}`` or ``node hdataserver.js --listen {PORT}``. You may also edit the config.json file and change the ``port`` property.

To use a different configuration file, you can use the command line flags ``-c {CONFIG FILE}`` or ``--config {CONFIG FILE}`` to specify the new config.