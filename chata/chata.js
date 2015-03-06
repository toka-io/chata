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
    
    this.numOfChatrooms = 0;
    this.chatrooms = {};
    this.sockets = {};
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
        if (!self.chatrooms.hasOwnProperty(json.chatroomID)) {
            self.chatrooms[json.chatroomID] = new Chatroom(json.chatroomID);
            self.numOfChatrooms++;
        }

        // Retrieve the chatroom the client is trying to join
        var chatroom = self.chatrooms[json.chatroomID];
        
        // Add the client
        chatroom.addClient(socket);        
        
        // Add user if they are logged in
        // Logged in users will have a username passed in the json
        if (json.username.trim() !== "")
            chatroom.addUser(json.username, socket);

        console.log((new Date()) + " [Chatroom " + json.chatroomID + "] " + json.username + " joined");

        // Send chat history to the client
        if (chatroom.history.data.length > 0) {
            socket.emit("history", chatroom.history);
        }
        
        // Go through all sockets and send them the updated user list and client list to them
        // This can be made more efficient to the ones in/viewing the chatroom
        for (var socketID in self.sockets) {        	
            if (socketID !== socket.id) {
        	self.sockets[socketID].emit('activeViewerCount', self.getActiveViewerCount());
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
        metrics.numberOfChatrooms = self.numOfChatrooms;

        console.log((new Date()) + " Client requested 'metrics'");
        
        socket.emit('metrics', metrics);
    });

    /*
     * viewers event
     * @desc: Client requests a list of all chatrooms and their active viewer count and users
     */
    socket.on('users', function(chatroomID) {
	if (typeof chatroomID === "string") {
	    var clientIp = socket.request.connection.remoteAddress;
    	
            console.log((new Date()) + " Client @ " + socket.request.connection.remoteAddress + " requested all viewers");
            
            socket.emit('activeViewerCount', self.getActiveViewerCount(chatroomID));
            socket.emit('users', self.getUsers(chatroomID));
	}
    });  
};
Chata.prototype.getActiveViewerCount = function(chatroomID) {
    var self = this;
    
    var activeViewerCount = {};
    
    if (typeof chatroomID === "undefined") {
        for (var chatroomID in self.chatrooms) {
            activeViewerCount[chatroomID] = self.chatrooms[chatroomID].numOfClients;
        }
    }
    else {
	activeViewerCount[chatroomID] = self.chatrooms[chatroomID].numOfClients;
    }
    
    return activeViewerCount;
};
Chata.prototype.getUsers = function(chatroomID) {
    var self = this;
    
    var users = {};
    users[chatroomID] = [];
    
    for (var username in self.chatrooms[chatroomID].users)
	users[chatroomID].push(username);
    
    return users;
};
// We can improve performance if we store the chatroomID to the sockets map...but what about when we have multiple chatrooms to one socket?
Chata.prototype.removeSocket = function(socket) {
    var self = this;
    
    for (var chatroomID in self.chatrooms) {
	var chatroom = self.chatrooms[chatroomID];
	chatroom.removeSocket(socket);
    }
};

/**
 * Chatroom object 
 * @desc: Toka chatroom
 */
function Chatroom(chatroomID) {
    this.chatroomID = chatroomID; // Unique identifier for chatroom
    this.clients = {}; // Easy access to clients
    this.history = new History(chatroomID); // Chatroom's history
    this.numOfClients = 0; // Number of people connected to this chatroom via ip
    this.sockets = {}; // Easy access to sockets
    this.socketToClient = {}; // Reverse lookup for client
    this.socketToUser = {}; // Reverse lookup for user
    this.users = {}; // Easy access to users
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
        self.numOfClients++;
    }
    
    self.clients[clientIp].addSocket(socket);
    self.socketToClient[socket.id] = clientIp;
};
/*
 * @desc: Adds a user if they have not already been added to this chatroom
 */
Chatroom.prototype.addUser = function(username, socket) {
    var self = this;
    if (!self.users.hasOwnProperty(username)) {
	var user = new User(username)
        self.users[username] = user;
    }
    
    self.users[username].addSocket(socket);
    self.socketToUser[socket.id] = username;
};
Chatroom.prototype.removeSocket = function(socket) {
    var self = this;
    var clientIp;
    var username;
    
    if (self.socketToClient.hasOwnProperty(socket.id)) {
	clientIp = self.socketToClient[socket.id];
	
	self.clients[clientIp].removeSocket(socket);
	// console.log("Removed socket for " + clientIp + ".");
	if (self.clients[clientIp].hasNoSockets()) {
	    delete self.clients[clientIp];
	    self.numOfClients--;
	    // console.log("No more sockets for " + clientIp + ". The client has been removed from chatroom " + self.chatroomID);
	}
    }
	  
    if (self.socketToUser.hasOwnProperty(socket.id)) {
	username = self.socketToUser[socket.id];
    
        self.users[username].removeSocket(socket);
        // console.log("Removed socket for " + username + ".");
        if (self.users[username].hasNoSockets()) {
            delete self.users[username];
            // console.log("No more sockets for " + username + ". The user has been removed from chatroom " + self.chatroomID);
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
    this.sockets = {};
}
Client.prototype.addSocket = function(socket) {
    var self = this;
    if (!self.sockets.hasOwnProperty(socket.id)) {
	self.sockets[socket.id] = socket;
    }
};
Client.prototype.removeSocket = function(socket) {
    var self = this;
    if (self.sockets.hasOwnProperty(socket.id)) {
	delete self.sockets[socket.id];
    }
};
Client.prototype.hasNoSockets = function() {
    var self = this;
    return !Object.keys(self.sockets).length;
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
 * User object
 * @desc: Username and their associated sockets
 */
function User(username) {
    this.username = username;
    this.sockets = {};
}
User.prototype.addSocket = function(socket) {
    var self = this;
    if (!self.sockets.hasOwnProperty(socket.id)) {
	self.sockets[socket.id] = socket;
    }
};
User.prototype.removeSocket = function(socket) {
    var self = this;
    if (self.sockets.hasOwnProperty(socket.id)) {
	delete self.sockets[socket.id];
    }
};
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