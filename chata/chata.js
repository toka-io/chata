/**
 * Chata - Simple Chat Server Module
 * @author: Andy Lim
 * @email: andytlim@gmail.com
 */
"use strict";

var moment = require('moment');
var chata = new Chata();

module.exports = chata;

/** 
 * Chata App 
 * @desc: Chata application. This is what initializes all of the socket events and manages socket and user sessions.
 */
function Chata() {
    this.database = null;
    this.instanceName = "chata";
    this.io = null;
    this.port = 1337;
    this.sockets = {};
    this.socketToClient = {}; // Reverse lookup for client
    this.socketToUser = {}; // Reverse lookup for user
}
Chata.prototype.addChatroom = function(chatroom, socket, send) {
    var self = this;

    try {
        var clientIp = normalizeIp(socket.request.connection.remoteAddress);
        var username = getCookie("username", socket.request.headers.cookie);

        var collection = self.database.collection('chata_chatroom');

        var query = {};
        query['chatroomID'] = chatroom.chatroomID;

        collection.findOne(query, function(err, document) {
            log("Creating new chatroom " + chatroom.chatroomID + "...");

            if (document !== null) {
                log("Chatroom " + chatroom.chatroomID + " already exists");

                // Add socket for chatroom
                chatroom.addSocket(socket, clientIp, username, send);
            } else {
                var document = new Chatroom(chatroom.chatroomID);
                document.chataInstances[self.instanceName] = {};

                collection.insert(document, {
                    w: 1
                }, function(err, result) {
                    if (!err) {
                        log("Chatroom " + chatroom.chatroomID + " has been created");

                        // Add socket for chatroom
                        chatroom.addSocket(socket, clientIp, username, send);
                    } else
                        log(err);
                });
            }
        });
    } catch (err) {
        log("Chata.addChatroom() error: " + err);
    }
};

/*
 * @desc: Add socket to chata instance. Add clientIp if it's defined. Add username if it's available.
 */
Chata.prototype.addSocket = function(socket, clientIp, username) {
    var self = this;

    try {
        if (!self.sockets.hasOwnProperty(socket.id)) {
            self.sockets[socket.id] = socket;

            if (clientIp)
                self.socketToClient[socket.id] = clientIp;

            if (username && username.trim() !== "")
                self.socketToUser[socket.id] = username;
        }
    } catch (err) {
        log("Chata.addSocket() error: " + err);
    }
};
Chata.prototype.getActiveViewerCount = function(send) {
    var self = this;

    var activeViewerCount = {};

    try {
        var collection = self.database.collection('chata_chatroom');

        var query = {};

        collection.find(query).toArray(function(err, documents) {
            for (var i = 0; i < documents.length; i++) {
                var document = documents[i];

                if (document !== null) {
                    activeViewerCount[document.chatroomID] = 0;

                    for (var ip in document.clients) {
                        var numOfSockets = document.clients[ip]['chataInstances'][self.instanceName].numOfSockets;

                        if (numOfSockets > 0)
                            activeViewerCount[document.chatroomID] = activeViewerCount[document.chatroomID] + 1;
                    }
                }
            }

            send('activeViewerCount', activeViewerCount);
        });
    } catch (err) {
        log("Chata.getActiveViewerCount() error: " + err);
    }
};
Chata.prototype.getChatroom = function(chatroomID) {
    var self = this;

    if (self.database) {

    }
};
Chata.prototype.getUsers = function(chatroomID) {
    var self = this;

    var users = {};
    users[chatroomID] = [];

    for (var username in self.chatrooms[chatroomID].users)
        users[chatroomID].push(username);

    return users;
};
Chata.prototype.initializeSocketEvents = function(socket) {
    var self = this;

    /*
     * activeViewerCount event
     * @desc: Client requests a list of all chatrooms and their viewer counts (ip-based not login based)
     */
    socket.on('activeViewerCount', function() {
        var clientIp = normalizeIp(socket.request.connection.remoteAddress);

        log("Client @ " + clientIp + " requested active viewer count");

        chata.getActiveViewerCount(self.sendAll);
    });

    //    /*
    //     * disconnect event
    //     * @desc: Client disconnects
    //     */
    //    socket.on("disconnect", function() {
    //  self.removeSocket(socket);
    //  
    //        log("Client @ " + normalizeIp(socket.request.connection.remoteAddress) + " disconnected");
    //  
    //        // Go through all sockets and send them the updated user list and client list to them
    //        // This can be made more efficient to the ones in/viewing the chatroom
    //        for (var socketID in self.sockets) {          
    //            if (socketID !== socket.id) {
    //          self.sockets[socketID].emit('activeViewerCount', self.getActiveViewerCount());
    //            }
    //        }
    //    });

    /*
     * join event
     * @desc: User joins chatroom
     */
    socket.on('join', function(json) {
        // Chatroom is created if it does not exist
        // Yes, I do not prevent a non-registered chatroom from being created - This could be API potential
        var chatroom = new Chatroom(json.chatroomID);

        self.addChatroom(chatroom, socket, self.sendAll);

        log("[Chatroom " + chatroom.chatroomID + "] " + self.socketToUser[socket.id] + " joined");

        // Send chat history to the client
        if (chatroom.history.messages.length > 0) {
            socket.emit("history", chatroom.history);
        }
    });

    //    // Make sure to add a check if it's JSON -- maybe even if it's a particular JSON object
    //    socket.on('sendMessage', function(json) {
    //  var chatroom;
    //  var message = new Message();
    //  
    //  if (message.isValidMessage(json)) {
    //            chatroom = self.chatrooms[json.chatroomID];
    //            message.bindJson(json);
    //    
    //            // Store message in history
    //            chatroom.updateHistory(message.data);
    //    
    //            log("[Chatroom " + chatroom.chatroomID + "] Received message from " + message.data.username + ": " + message.data.text);
    //    
    //            // Go through all sockets stored in chatroom and send the message to them
    //            for (var clientIp in chatroom.clients) {
    //                var chatroomSockets = chatroom.clients[clientIp].sockets;
    //                for (var socketID in chatroomSockets) {
    //                    if (socketID !== socket.id) {
    //                        chatroomSockets[socketID].emit('receiveMessage', message);
    //                    }
    //                }
    //            }
    //  }
    //    });
    //
    //    /*
    //     * viewers event
    //     * @desc: Client requests a list of all chatrooms and their active viewer count and users
    //     */
    //    socket.on('users', function(chatroomID) {
    //  if (typeof chatroomID === "string") {
    //      var clientIp = normalizeIp(socket.request.connection.remoteAddress);
    //      
    //            log("Client @ " + clientIp + " requested all viewers");
    //            
    //            socket.emit('activeViewerCount', self.getActiveViewerCount(chatroomID));
    //            socket.emit('users', self.getUsers(chatroomID));
    //  }
    //    });  
};
Chata.prototype.sendAll = function(event, data) {
        // Go through all sockets and send them the updated user list and client list to them
        // This can be made more efficient to the ones in/viewing the chatroom
        for (var socketID in chata.sockets) {
            chata.sockets[socketID].emit(event, data);
        }
    }
    /*
     * @desc: Starts server at port 1337
     */
Chata.prototype.startInstance = function(options) {
    var self = this;

    try {
        var app;

        // Chata instance name
        if (options && options.instanceName)
            self.instanceName = options.instanceName;

        log("Starting chata instance '" + self.instanceName + "'...")

        // HTTPS or HTTP
        if (options && options.ssl) {
            app = require('https').createServer(options.ssl);
            self.io = require('socket.io')(app);

            log(self.instanceName + " is using https");
        } else {
            app = require('http').createServer();
            self.io = require('socket.io')(app);
            log("Server is using http");
        }

        // Add a database to chata
        if (options && options.database) {
            if (options.database.type === 'mongo') {
                var MongoClient = require('mongodb').MongoClient;
                MongoClient.connect(options.database.connectionUrl, function(err, db) {
                    if (!err) {
                        self.database = db;
                        log(self.instanceName + " connected to mongodb successfully");

                        // Clears sockets for this chata instance
                        var collection = self.database.collection('chata_chatroom');

                        var query = {};

                        collection.find(query, function(err, cursor) {
                            if (!err) {
                                cursor.each(function(err, document) {
                                    if (document !== null) {
                                        var query = {
                                            'chatroomID': document.chatroomID
                                        };

                                        var updateData = {};
                                        updateData['$set'] = {};
                                        updateData['$set']['chataInstances.' + self.instanceName] = {};

                                        for (var clientIp in document.clients) {
                                            updateData['$set']['clients.' + clientIp + '.chataInstances.' + self.instanceName + '.numOfSockets'] = 0;
                                        }

                                        for (var username in document.users) {
                                            updateData['$set']['users.' + username + '.chataInstances.' + self.instanceName + '.numOfSockets'] = 0;
                                        }

                                        collection.update(
                                            query,
                                            updateData,
                                            function(err, result) {
                                                if (!err) {
                                                    log(self.instanceName + " has been reset in database");
                                                } else
                                                    log(err);
                                            }
                                        );
                                    }
                                });

                                // Add a connect listener
                                self.io.on('connection', function(socket) {
                                    // Client connected
                                    var clientIp = normalizeIp(socket.request.connection.remoteAddress);
                                    log("New connection from " + clientIp);

                                    var username = getCookie("username", socket.request.headers.cookie);
                                    log("Cookie: " + username);

                                    // Add socket to global chata server
                                    self.addSocket(socket, clientIp, username);

                                    self.initializeSocketEvents(socket);
                                });

                                // Start listening for connections using custom port or default port
                                if (options && options.port) {
                                    app.listen(options.port);
                                    log(self.instanceName + " is listening on port " + options.port);
                                } else {
                                    app.listen(self.port);
                                    log(self.instanceName + " is listening on port " + self.port);
                                }
                            } else
                                log(err);
                        });
                    } else
                        log(err);
                });
            }
        } else
            log("This version of chata requires a database! Please use chata 1.1 if you need single instances.")
    } catch (err) {
        log("Chata.startInstance() error: " + err);
    }
};
Chata.prototype.removeSocket = function(socket) {
    var self = this;

    try {
        if (self.sockets.hasOwnProperty(socket.id)) {
            self.sockets[socket.id] = socket;

            if (clientIp)
                self.socketToClient[socket.id] = clientIp;

            if (username && username.trim() !== "")
                self.socketToUser[socket.id] = username;
        }
    } catch (err) {
        log("Chata.removeSocket() error: " + err);
    }
};

/**
 * Chatroom object 
 * @desc: Toka chatroom
 */
function Chatroom(chatroomID) {
    this.chataInstances = {}; // Stores sockets associated with all chata instances
    this.chatroomID = chatroomID; // Unique identifier for chatroom
    this.clients = {}; // Client list
    this.history = new History(chatroomID); // Chatroom's history
    this.messageQueue = {};
    this.numOfClients = 0; // Number of people connected to this chatroom via ip
    this.users = {}; // Users list
}
/*
 * @desc: Add socket to chatroom for this chata instance. Adds a client if it has not already been added to this chatroom. The clientIp will be added to clients and the numOfSockets
 * for this chata instance will increment by 1. Adds a user if it has not already been added to this chatroom. The username will be added to users and the numOfSockets
 * for this chata instance will increment by 1.
 */
Chatroom.prototype.addSocket = function(socket, clientIp, username, send) {
    var self = this;

    try {
        var clientIp = normalizeIp(socket.request.connection.remoteAddress);

        var client = new Client(clientIp);
        client.chataInstances[chata.instanceName] = {};

        var user = new User(username);
        user.chataInstances[chata.instanceName] = {};


        var collection = chata.database.collection('chata_chatroom');

        var query = {};
        query['chatroomID'] = self.chatroomID;

        collection.findOne(query, function(err, document) {
            log("Adding new socket " + socket.id + " to chatroom " + self.chatroomID + "...");

            if (document !== null) {
                var query = {
                    'chatroomID': self.chatroomID
                };

                var updateData = {};
                updateData['$set'] = {};
                updateData['$inc'] = {};

                // Add socket to chataInstances if it's the first socket or an additional socket
                if (!document['chataInstances'].hasOwnProperty(chata.instanceName)) {
                    updateData['$set']['chataInstances.' + chata.instanceName + '.' + socket.id] = true;
                } else if (!document['chataInstances'][chata.instanceName].hasOwnProperty(socket.id)) {
                    updateData['$set']['chataInstances.' + chata.instanceName + '.' + socket.id] = true;
                } else {
                    log("Socket " + socket.id + " already exists for chatroom " + self.chatroomID);
                }

                // Increment socket count for client for this chata instance
                if (!document['clients'].hasOwnProperty(clientIp)) {
                    client.chataInstances[chata.instanceName]['numOfSockets'] = 1;
                    updateData['$set']['clients.' + clientIp] = client;
                } else {
                    updateData['$inc']['clients.' + clientIp + '.chataInstances.' + chata.instanceName + '.numOfSockets'] = 1;
                }

                // Increment socket count for user for this chata instance                    
                if (!document['users'].hasOwnProperty(username)) {
                    user.chataInstances[chata.instanceName]['numOfSockets'] = 1;
                    updateData['$set']['users.' + username] = user;
                } else {
                    updateData['$inc']['users.' + username + '.chataInstances.' + chata.instanceName + '.numOfSockets'] = 1;
                }

                if (isEmptyObject(updateData['$set']))
                    delete updateData['$set'];

                if (isEmptyObject(updateData['$inc']))
                    delete updateData['$inc'];

                collection.update(
                    query,
                    updateData,
                    function(err, result) {
                        if (!err) {
                            log("Chatroom " + self.chatroomID + " has been updated  ");

                            chata.getActiveViewerCount(send);
                        } else
                            log(err);
                    }
                );
            } else {
                log("Chatroom " + self.chatroomID + " does not exist!");
            }
        });
    } catch (err) {
        log("Chatroom.addSocket() error: " + err);
    }
};
Chatroom.prototype.removeSocket = function(socket) {
    var self = this;
    var clientIp;
    var username;

    if (self.socketToClient.hasOwnProperty(socket.id)) {
        clientIp = self.socketToClient[socket.id];

        self.clients[clientIp].removeSocket(socket);

        if (self.clients[clientIp].hasNoSockets()) {
            delete self.clients[clientIp];
            self.numOfClients--;
        }
    }

    if (self.socketToUser.hasOwnProperty(socket.id)) {
        username = self.socketToUser[socket.id];

        self.users[username].removeSocket(socket);

        if (self.users[username].hasNoSockets()) {
            delete self.users[username];
        }
    }
};
Chatroom.prototype.updateHistory = function(message) {
    var self = this;
    self.history.addMessage(message);
};

/** 
 * Client object
 * @desc: Clients are any physical device with an ip. Multiple sockets can come from a client.
 */
function Client(clientIp) {
    this.clientIp = clientIp;
    this.chataInstances = {};
}
Client.prototype.hasNoSockets = function() {
    var self = this;
    return !Object.keys(self.sockets).length;
};
Client.prototype.bindJson = function(json) {
    this.clientIp = json.clientIp;
    this.sockets = json.sockets;
    this.chataInstances = json.chataInstances;
}

/** 
 * History object
 * @desc: Stores chatroom messages up to 100
 */
function History(chatroomID) {
    this.messages = [];
}
History.prototype.addMessage = function(message) {
    var self = this;
    self.messages.push(message);
    self.messages = self.messages.slice(-100); // Remove this if you want to store permanaent history
};

/**
 * Message object
 * @desc: Chatroom message format 
 */
function Message() {
    this.chatroomID;
    this.type = "message";
    this.data = {};
    this.data.timestamp = moment().utc().format('MMM D, YYYY h:mm a');
}
Message.prototype.isValidMessage = function(json) {
    try {
        if (typeof json.chatroomID !== "string")
            return false;

        if (typeof json.text !== "string")
            return false;

        if (typeof json.username !== "string")
            return false;
    } catch (err) {
        return false;
    }

    return true;
}
Message.prototype.bindJson = function(json) {
    var self = this;

    self.chatroomID = json.chatroomID;
    self.data.username = json.username;
    self.data.text = json.text;
}


/** 
 * User object
 * @desc: Username and their associated sockets
 */
function User(username) {
    this.username = username;
    this.chataInstances = {};
}
User.prototype.hasNoSockets = function() {
    var self = this;
    return !Object.keys(self.sockets).length;
};


/**
 * Helper function for debugging contents of objects
 */
function getCookie(cname, cookie) {
    if (typeof cookie === "undefined")
        return "";

    var name = cname + "=";
    var ca = cookie.split(";");
    for (var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == " ")
            c = c.substring(1);
        if (c.indexOf(name) == 0)
            return c.substring(name.length, c.length);
    }

    return "";
}

function isEmptyObject(obj) {
    return !Object.keys(obj).length;
}

function log(str) {
    console.log((new Date()) + " " + str);
}

function normalizeIp(ip) {
    if (typeof ip === "undefined")
        return "";

    ip = ip.replace(/\./g, "_");
    return ip.substr(7, ip.length);
}

function printObj(obj) {
    for (var key in obj) {
        log(key + ": " + obj[key]);
    }
}