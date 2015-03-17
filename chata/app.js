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
    port: 1337,
    ssl: {
        key: fs.readFileSync('X:/domains/toka.io/ssl/toka_io.key').toString(),
        cert: fs.readFileSync('X:/domains/toka.io/ssl/toka_io.crt').toString(),
        ca: fs.readFileSync('X:/domains/toka.io/ssl/DigiCertCA.crt').toString(),
        rejectUnauthorized: false
    }
};

chata.startServer(options);