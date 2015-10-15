/**
 * Chata - Simple Chat Server Executable
 * @author: Andy Lim
 * @email: andytlim@gmail.com
 */
"use strict";

// Name in eg. 'ps' or 'top' command
process.title = 'chata';

// Start chata server
var chata = require('./chata');

var fs = require('fs');

var options = {
    database: {
        type: 'mongo',
        connectionUrl: 'mongodb://' + encodeURIComponent('toka') + ':' + encodeURIComponent('Mir@c!3!23') + '@ds055021-a0.mongolab.com:55021,ds055021-a1.mongolab.com:55021/toka'
    },
    instanceName: 'chata_1',
    port: 1234,
    ssl: {
        key: fs.readFileSync('X:/domains/toka.io/ssl/wildcard_toka_io.key', 'utf-8'),
        cert: fs.readFileSync('X:/domains/toka.io/ssl/wildcard_toka_io.crt', 'utf-8'),
        ca: fs.readFileSync('X:/domains/toka.io/ssl/DigiCertCA.crt', 'utf-8'),
        rejectUnauthorized: false
    }
};

chata.startInstance(options);