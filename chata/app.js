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
chata.startServer();