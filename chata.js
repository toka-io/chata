/**
 * Chata - Simple Chat Server Module
 * @author: Andy Lim
 * @email: andytlim@gmail.com
 */
"use strict";

module.exports = new Chata();

var moment = require('moment');
var fs = require('fs');

/** 
 * Chata App 
 * @desc: Chata application. This is what initializes all of the socket evens and manages socket and user sessions.
 */
function Chata() {
    this.io;
    this.port = 1337;

    this.chatrooms = {};
    this.sockets = {};

    var self = this;

    // Gets cookie for domain
    this.getCookie = function(cname, cookie) {
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

    // Debugging Only - Prints objects JSON.stringify() cannot support
    this.printObj = function(obj) {
        for (var key in obj) {
            console.log(key + ": " + obj[key]);
        }
    }

    /*
     * @desc: Starts server at specified port
     */
    this.startServer = function(options) {
        var app;

        console.log("Loading save state...");
        self.loadSave();

        // Uses ssl if certificate information is provided
        if (options && options.ssl) {
            app = require('https').createServer(options.ssl);
            console.log((new Date()) + " Server is using https");
        } else {
            app = require('http').createServer();
            console.log((new Date()) + " Server is using http");
        }

        // Start server with app options
        self.io = require('socket.io')(app);

        // Add a connect listener
        self.io.on('connection', function(socket) {
            // Add socket to global chata server
            self.sockets[socket.id] = socket;

            // Client connected
            var clientIp = socket.request.connection.remoteAddress;
            console.log((new Date()) + " New connection from " + clientIp);
            console.log((new Date()) + " Cookie: " + self.getCookie("username", socket.request.headers.cookie));

            self.socketEvents(socket);
        });

        // Specifies what port to listen on
        if (options && options.port) {
            app.listen(options.port);
            console.log((new Date()) + " Server is listening on port " + options.port);
            self.port = options.port;
        } else {
            app.listen(self.port);
            console.log((new Date()) + " Server is listening on port " + self.port);
        }
    }

    this.socketEvents = function(socket) {
        /*
         * activeViewerCount event
         * @desc: Client requests a list of all chatrooms and their viewer counts (ip-based not login based)
         */
        socket.on('activeViewerCount', function() {
            var clientIp = socket.request.connection.remoteAddress;

            console.log((new Date()) + " Client @ " + socket.request.connection.remoteAddress + " requested active viewer count");

            socket.emit('activeViewerCount', self.getActiveViewerCount());
        });

        /*
         * disconnect event
         * @desc: Client disconnects
         */
        socket.on("disconnect", function() {
            self.removeSocket(socket);

            console.log((new Date()) + " Client @ " + socket.request.connection.remoteAddress + " disconnected");

            // Go through all sockets and send them the updated user list and client list to them
            // This can be made more efficient to the ones in/viewing the chatroom
            for (var socketID in self.sockets) {
                if (socketID !== socket.id) {
                    self.sockets[socketID].emit('activeViewerCount', self.getActiveViewerCount());
                }
            }
        });

        /*
         * join event
         * @desc: User joins chatroom
         */
        socket.on('join', function(json) {
            // Chatroom is created if it does not exist
            // Yes, I do not prevent a non-registered chatroom from being created - This could be API potential
            
            if (!self.chatrooms.hasOwnProperty(json.chatroomId)) {
                self.chatrooms[json.chatroomId] = new Chatroom(json.chatroomId);
            }

            // Retrieve the chatroom the client is trying to join
            var chatroom = self.chatrooms[json.chatroomId];

            // Add the client
            chatroom.addClient(socket);

            // Add user if they are logged in
            // Logged in users will have a username passed in the json
            if (json.username.trim() !== "")
                chatroom.addUser(json.username, socket);

            console.log((new Date()) + " [Chatroom " + json.chatroomId + "] " + json.username + " joined");

            // Send chat history to the client
            socket.emit("history", chatroom.history);
            

            // Go through all sockets and send them the updated user list and client list to them
            // This can be made more efficient to the ones in/viewing the chatroom
            for (var socketID in self.sockets) {
                if (socketID !== socket.id) {
                    self.sockets[socketID].emit('activeViewerCount', self.getActiveViewerCount());
                }
            }
        });

        // Make sure to add a check if it's JSON -- maybe even if it's a particular JSON object
        socket.on('sendMessage', function(json) {
            var chatroom;
            var message = new Message();

            if (!message.isValidMessage(json)) return;        

            if (!self.chatrooms.hasOwnProperty(json.chatroomId)) {
                self.chatrooms[json.chatroomId] = new Chatroom(json.chatroomId);
            }

            chatroom = self.chatrooms[json.chatroomId];
            message.create(json);

            // Store message in history
            chatroom.updateHistory(message);

            console.log((new Date()) + " [Chatroom " + chatroom.chatroomId + "] Received message from " + message.username + ": " + message.text);

            // Go through all sockets stored in chatroom and send the message to them
            for (var clientIp in chatroom.clients) {
                var chatroomSockets = chatroom.clients[clientIp].sockets;
                for (var socketID in chatroomSockets) {
                    if (socketID !== socket.id) {
                        chatroomSockets[socketID].emit('receiveMessage', message);
                    }
                }
            }
        });

        /*
         * viewers event
         * @desc: Client requests a list of all chatrooms and their active viewer count and users
         */
        socket.on('users', function(chatroomId) {
            if (typeof chatroomId === "string") {
                var clientIp = socket.request.connection.remoteAddress;

                console.log((new Date()) + " Client @ " + socket.request.connection.remoteAddress + " requested all viewers");

                socket.emit('activeViewerCount', self.getActiveViewerCount(chatroomId));
                socket.emit('users', self.getUsers(chatroomId));
            }
        });
    }

    this.getActiveViewerCount = function(chatroomId) {
        var activeViewerCount = {};

        if (typeof chatroomId === "undefined") {
            for (var chatroomId in self.chatrooms) {
                activeViewerCount[chatroomId] = self.chatrooms[chatroomId].numOfClients;
            }
        } else {
            activeViewerCount[chatroomId] = self.chatrooms[chatroomId].numOfClients;
        }

        return activeViewerCount;
    }

    this.getUsers = function(chatroomId) {
        var users = {};
        users[chatroomId] = [];

        for (var username in self.chatrooms[chatroomId].users)
            users[chatroomId].push(username);

        return users;
    }

    this.loadSave = function() {
        var chatrooms = JSON.parse(fs.readFileSync('data/save.json').toString());

        for (var chatroomId in chatrooms) {
            chatrooms[chatroomId].__proto__ = Chatroom.prototype;
            chatrooms[chatroomId].history.__proto__ = History.prototype;
        }
        self.chatrooms = chatrooms;
    }

    // We can improve performance if we store the chatroomId to the sockets map...but what about when we have multiple chatrooms to one socket?
    this.removeSocket = function(socket) {
        for (var chatroomId in self.chatrooms) {
            var chatroom = self.chatrooms[chatroomId];
            chatroom.removeSocket(socket);
        }
    }

    this.saveState = function() {
        for (var chatroomId in self.chatrooms) {
            self.chatrooms[chatroomId].clients = {};
            self.chatrooms[chatroomId].numOfClients = 0;
            self.chatrooms[chatroomId].sockets = {};
            self.chatrooms[chatroomId].socketToClient = {};
            self.chatrooms[chatroomId].socketToUser = {};
            self.chatrooms[chatroomId].users = {};        
        }

        console.log((new Date()) + " Saving chata state..." + JSON.stringify(self.chatrooms));
        fs.writeFileSync('data/save.json', JSON.stringify(self.chatrooms));
        process.exit();
    }
}

/**
 * Chatroom object 
 * @desc: Toka chatroom
 */
function Chatroom(chatroomId) {
    this.chatroomId = chatroomId; // Unique identifier for chatroom
    this.clients = {}; // Easy access to clients
    this.history = new History(chatroomId); // Chatroom's history
    this.numOfClients = 0; // Number of people connected to this chatroom via ip
    this.sockets = {}; // Easy access to sockets
    this.socketToClient = {}; // Reverse lookup for client
    this.socketToUser = {}; // Reverse lookup for user
    this.users = {}; // Easy access to users

    var self = this;

    /*
     * @desc: Adds a client if it has not already been added to this chatroom
     *  Maps the socket to a client if it is not already mapped
     */
    this.addClient = function(socket) {
        var clientIp = socket.request.connection.remoteAddress;

        if (!self.clients.hasOwnProperty(clientIp)) {
            var client = new Client(clientIp);
            self.clients[clientIp] = client;
            self.numOfClients++;
        }

        self.clients[clientIp].addSocket(socket);
        self.socketToClient[socket.id] = clientIp;
    }

    /*
     * @desc: Adds a user if they have not already been added to this chatroom
     */
    this.addUser = function(username, socket) {
        if (!self.users.hasOwnProperty(username)) {
            var user = new User(username)
            self.users[username] = user;
        }

        self.users[username].addSocket(socket);
        self.socketToUser[socket.id] = username;
    }

    this.removeSocket = function(socket) {
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
    }

    this.updateHistory = function(message) {
        self.history.addMessage(message);
    }
}

/** 
 * Client object
 * @desc: Clients are any physical device with an ip. Multiple sockets can come from a client.
 */
function Client(clientIp) {
    this.clientIp = clientIp;
    this.sockets = {};
    
    var self = this;

    this.addSocket = function(socket) {
        if (!self.sockets.hasOwnProperty(socket.id)) {
            self.sockets[socket.id] = socket;
        }
    }

    this.removeSocket = function(socket) {
        if (self.sockets.hasOwnProperty(socket.id)) {
            delete self.sockets[socket.id];
        }
    }

    this.hasNoSockets = function() {
        return !Object.keys(self.sockets).length;
    }
}

/** 
 * History object
 * @desc: Stores chatroom messages up to 100
 */
function History(chatroomId) {
    this.chatroomId = chatroomId;
    this.data = [];

    var self = this;

    this.addMessage = function(message) {
        self.data.push(message);
        self.data = self.data.slice(-250);
    }
}

/**
 * Message object
 * @desc: Chatroom message format 
 */
function Message() {
    this.chatroomId;
    this.username;
    this.text;
    this.timestamp = moment().utc().format('MMM D, YYYY h:mm a');

    var self = this;

    this.isValidMessage = function(json) {
        try {
            if (typeof json.chatroomId !== "string")
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

    this.create = function(json) {
        self.chatroomId = json.chatroomId;
        self.username = json.username;
        self.text = json.text;
    }
}


/** 
 * User object
 * @desc: Username and their associated sockets
 */
function User(username) {
    this.username = username;
    this.sockets = {};

    var self = this;

    this.addSocket = function(socket) {
        if (!self.sockets.hasOwnProperty(socket.id)) {
            self.sockets[socket.id] = socket;
        }
    }

    this.removeSocket = function(socket) {
        if (self.sockets.hasOwnProperty(socket.id)) {
            delete self.sockets[socket.id];
        }
    }

    this.hasNoSockets = function() {
        return !Object.keys(self.sockets).length;
    }
}