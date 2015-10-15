/**
 * Chata 1.0 - Simple Chat Server Executable (Local)
 * @author: Andy Lim
 * @email: andytlim@gmail.com
 */
"use strict";

// Name in eg. 'ps' or 'top' command
process.title = 'chata';

// Start chata server
var chata = require('./chata');

var fs = require('fs');

var port = (process.argv[2]) ? process.argv[2] : 1337; 

var options = {
    port: port,
    ssl: {
        key: fs.readFileSync('X:/domains/toka.io/ssl/wildcard_toka_io.key').toString(),
        cert: fs.readFileSync('X:/domains/toka.io/ssl/wildcard_toka_io.crt').toString(),
        ca: fs.readFileSync('X:/domains/toka.io/ssl/DigiCertCA.crt').toString(),
        rejectUnauthorized: false
    }
    /* ssl: {
	    key: fs.readFileSync('/etc/httpd/conf.d/domains/toka.io/ssl/wildcard_toka_io.key', 'utf-8'),
	    cert: fs.readFileSync('/etc/httpd/conf.d/domains/toka.io/ssl/wildcard_toka_io.crt', 'utf-8'),
	    ca: fs.readFileSync('/etc/httpd/conf.d/domains/toka.io/ssl/DigiCertCA.crt', 'utf-8'),
	    rejectUnauthorized: false
	} */
};

chata.startServer(options);

//process.stdin.resume();

//do something when app is closing
process.on('exit', function() {chata.saveState()});

//catches ctrl+c event
process.on('SIGINT', function() {chata.saveState()});

//catches uncaught exceptions
process.on('uncaughtException', function() {chata.saveState()});