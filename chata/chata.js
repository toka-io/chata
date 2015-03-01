/**
 * Chata - Simple Chat Server Module
 * @author: Andy Lim
 * @email: andytlim@gmail.com
 */
"use strict";

module.exports = new Chata();	

/** 
 * Chata App 
 * @desc: Chata application. This is what initializes all of the socket evens and manages socket and user sessions.
 */
function Chata() {
    this.io = null;
    this.port = 1337;
    this.sockets = {};
    
    this.chatrooms = {};
    this.chatroomList = [];
}
/*
 * @desc: Starts server at port 1337
 */
Chata.prototype.startServer = function() {
    var self = this;
    
    self.io = require('socket.io')(require('http').createServer());
    
    // Add a connect listener
    self.io.on('connection', function(socket) {
	// Add socket to global chata server
	self.sockets[socket.id] = socket;
	
        // Client connected
        var clientIp = socket.request.connection.remoteAddress;
        console.log((new Date()) + " New connection from " + clientIp);
        console.log((new Date()) + " Cookie: " + getCookie("username", socket.request.headers.cookie));
        
        self.initializeSocketEvents(socket);
    });    

    self.io.listen(self.port);
    console.log((new Date()) + " Server is listening on port " + self.port);
};
Chata.prototype.initializeSocketEvents = function(socket) {
    var self = this;    

    /*
     * disconnect event
     * @desc: Client disconnects
     */
    socket.on("disconnect", function() {
        console.log((new Date()) + " Client @ " + socket.request.connection.remoteAddress + " disconnected");
    });

    /*
     * join event
     * @desc: User joins chatroom
     */
    socket.on('join', function(json) {	
	// Chatroom is created if it does not exist
	// Yes, I do not prevent a non-registered chatroom from being created - This could be API potential
        if (!self.chatrooms.hasOwnProperty(json.chatroomID)) {
            self.chatrooms[json.chatroomID] = new Chatroom(json.chatroomID);
            self.chatroomList.push(self.chatrooms[json.chatroomID]);
        }

        // Retrieve the chatroom the client is trying to join
        var chatroom = self.chatrooms[json.chatroomID];      
        
        // Add the client
        chatroom.addClient(socket);        
        
        // Add user if they are logged in
        // Logged in users will have a username passed in the json
        if (json.username.trim() !== "")
            chatroom.addUser(json.username);

        console.log((new Date()) + " [Chatroom " + json.chatroomID + "] " + json.username + " joined");

        // Send chat history to the client
        if (chatroom.history.data.length > 0) {
            socket.emit("history", chatroom.history);
        }
        
        // Go through all sockets and send them the updated user list and client list to them       
        for (var socketID in self.sockets) {        	
            if (socketID !== socket.id) {
        	self.sockets[socketID].emit('users', self.getUsers());
        	self.sockets[socketID].emit('viewers', self.getViewers());
            }
        }
    });

    // Make sure to add a check if it's JSON -- maybe even if it's a particular JSON object
    socket.on('message', function(json) {
	var chatroom;
	var message = new Message();
	
	if (message.isValidMessage(json)) {
            chatroom = self.chatrooms[json.chatroomID];
            message.bindJson(json);
    
            // Store message in history
            chatroom.updateHistory(message.data);
    
            console.log((new Date()) + " [Chatroom " + chatroom.chatroomID + "] Received message from " + message.data.username + ": " + message.data.text);
    
            // Go through all sockets stored in chatroom and send the message to them
            for (var clientIp in chatroom.clients) {
                var chatroomSockets = chatroom.clients[clientIp].sockets;
                for (var socketID in chatroomSockets) {
                    if (socketID !== socket.id) {
                        chatroomSockets[socketID].emit('message', message);
                    }
                }
            }
	}
    });
    
    socket.on('metrics', function(json) {
        var metrics = {};
        metrics.numberOfChatrooms = self.chatroomList.length;

        console.log((new Date()) + " Client requested 'metrics'");
        
        socket.emit('metrics', metrics);
    });

    /*
     * users event
     * @desc: Client requests a list of all chatrooms and their users
     */
    socket.on('users', function() {
	var clientIp = socket.request.connection.remoteAddress;
	
        console.log((new Date()) + " Client @ " + socket.request.connection.remoteAddress + " requested all users");
        
        socket.emit('users', self.getUsers());
    });    

    /*
     * viewers event
     * @desc: Client requests a list of all chatrooms and their viewers (ip-based not login based) 
     */
    socket.on('viewers', function() {
	var clientIp = socket.request.connection.remoteAddress;
	
        console.log((new Date()) + " Client @ " + socket.request.connection.remoteAddress + " requested all viewers");
        
        socket.emit('viewers', self.getViewers());
    });    
};
Chata.prototype.getUsers = function() {
    var self = this;
    
    var users = {};
    
    for (var chatroomID in self.chatrooms) {
	users[chatroomID] = self.chatrooms[chatroomID].usersList;
    }
    
    return users;
};
Chata.prototype.getViewers = function() {
    var self = this;
    
    var viewers = {};
    
    for (var chatroomID in self.chatrooms) {
	viewers[chatroomID] = self.chatrooms[chatroomID].clientList;
    }
    
    return viewers;
};

/**
 * Chatroom object 
 * @desc: Toka chatroom
 */
function Chatroom(chatroomID) {
    this.chatroomID = chatroomID; // Unique identifier for chatroom
    this.clients = {}; // Easy access to clients
    this.clientList = []; // Number of people connected to this chatroom via ip
    this.history = new History(chatroomID); // Chatroom's history
    this.sockets = {}; // Easy access to sockets
    this.socketList = []; // Not used
    this.users = {}; // Easy access to users
    this.usersList = []; // Number of people logged in & viewing chatroom
}
/*
 * @desc: Adds a client if it has not already been added to this chatroom
 * 	Maps the socket to a client if it is not already mapped
 */
Chatroom.prototype.addClient = function(socket) {
    var self = this
    var clientIp = socket.request.connection.remoteAddress;
    
    if (!self.clients.hasOwnProperty(clientIp)) {
	var client = new Client(clientIp);
        self.clients[clientIp] = client;
        self.clientList.push(clientIp);
    }
    
    self.clients[clientIp].addSocket(socket);
};
/*
 * @desc: Adds a user if they have not already been added to this chatroom
 */
Chatroom.prototype.addUser = function(username) {
    var self = this;
    if (!self.users.hasOwnProperty(username)) {
        self.users[username] = username;
        self.usersList.push(username);
    }
};
Chatroom.prototype.removeClient = function(clientIp) {
    
};
Chatroom.prototype.removeUser = function(clientIp) {
    
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
    this.sockets = {};
    this.socketList = [];
}
Client.prototype.addSocket = function(socket) {
    var self = this;
    if (!self.sockets.hasOwnProperty(socket.id)) {
	self.sockets[socket.id] = socket;
    }
};
Client.prototype.removeSocket = function(socket) {
    var self = this;
    if (!self.sockets.hasOwnProperty(socket.id)) {
	self.sockets[socket.id] = socket;
    }
};

/** 
 * History object
 * @desc: Stores chatroom messages up to 100
 */
function History(chatroomID) {
    this.chatroomID = chatroomID;
    this.type = "history";
    this.data = [];
}
History.prototype.addMessage = function(message) {
    var self = this;
    self.data.push(message);
    self.data = self.data.slice(-100); // Remove this if you want to store permanaent history
};

/**
 * Message object
 * @desc: Chatroom message format 
 */
function Message() {
    this.chatroomID;
    this.type = "message";
    this.data = {};
}
Message.prototype.isValidMessage = function(json) {
    try {
        if (typeof json.chatroomID !== "string")
            return false;
        
        if (typeof json.text !== "string")
            return false;
        
        if (typeof json.username !== "string")
            return false;
    }
    catch (err) {
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
 * Helper function for debugging contents of objects
 */
function getCookie(cname, cookie) {
    if (typeof cookie === "undefined")
	return "";
    
    var name = cname + "=";
    var ca = cookie.split(";");
    for(var i = 0; i < ca.length; i++) {
        var c = ca[i];
        while (c.charAt(0) == " ") 
            c = c.substring(1);
        if (c.indexOf(name) == 0) 
            return c.substring(name.length,c.length);
    }
    
    return "";
}
function printObj(obj) {
    for (var key in obj) {
        console.log(key + ": " + obj[key]);
    }
}