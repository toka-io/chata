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

        // Client connected
        var clientIp = socket.request.connection.remoteAddress;
        console.log((new Date()) + " New connection from " + clientIp);
        console.log((new Date()) + "Cookie: " + socket.request.headers.cookie);
        
        self.initializeSocketEvents(socket);

    });    

    self.io.listen(self.port);
    console.log((new Date()) + " Server is listening on port " + self.port);
};
Chata.prototype.initializeSocketEvents = function(socket) {
    var self = this;
    
    socket.on('chatroomUsers', function() {
        console.log((new Date()) + " Client requested chatroomUsers");
        
        socket.emit('chatroomUsers', self.getChatroomUsers());
    });

    socket.on('join', function(json) {
        if (!self.chatrooms.hasOwnProperty(json.chatroomID)) {
            self.chatrooms[json.chatroomID] = new Chatroom(json.chatroomID);
            self.chatroomList.push(self.chatrooms[json.chatroomID]);
        }

        var chatroom = self.chatrooms[json.chatroomID];
        chatroom.addClient(socket);
        chatroom.addUser(json.username);

        console.log((new Date()) + " [Chatroom " + json.chatroomID + "] " + json.username + " joined");

        // Send chat history
        if (chatroom.history.data.length > 0) {
            socket.emit("history", chatroom.history);
        }
    });

    // Make sure to add a check if it's JSON -- maybe even if it's a particular JSON object
    socket.on('message', function(json) {
        var chatroom = self.chatrooms[json.chatroomID];
        var message = new Message(json.chatroomID, json.username, json.text);

        // Store message in history
        chatroom.updateHistory(message.data);

        console.log((new Date()) + " [Chatroom " + chatroom.chatroomID + "] Received message from " + message.data.username + ": " + message.data.text);

        // Go through all sockets aka clients stored in chatroom and send the message to them
        for (var socketID in chatroom.clients) {
            if (socketID !== socket.id)
        	chatroom.clients[socketID].emit('message', message);
        }
    });
    
    socket.on('metrics', function(json) {
        var metrics = {};
        metrics.numberOfChatrooms = self.chatroomList.length;

        console.log((new Date()) + " Client requested 'metrics'");
        
        socket.emit('metrics', metrics);
    });


    socket.on("disconnect", function() {
        // clearInterval(interval);
        console.log((new Date()) + " Client has disconnected");
    });
};
Chata.prototype.getChatroomUsers = function() {
    var self = this;
    
    var chatroomUsers = {};
    
    for (var chatroomID in self.chatrooms) {
	chatroomUsers[chatroomID] = self.chatrooms[chatroomID].usersList;
    }
    
    return chatroomUsers;
};

/**
 * Chatroom object 
 * @desc: Toka chatroom
 */
function Chatroom(chatroomID) {
    this.chatroomID = chatroomID; // Unique identifier for chatroom
    this.history = new History(chatroomID); // Chatroom's history
    this.users = {}; // Easy access to users
    this.usersList = []; // Number of people logged in & viewing chatroom
    this.clients = {}; // Number of people connected to this chatroom
}
Chatroom.prototype.addClient = function(socket) {
    var self = this
    if (!self.clients.hasOwnProperty(socket.id))
        self.clients[socket.id] = socket;
};
Chatroom.prototype.addUser = function(username) {
    var self = this;
    if (!self.users.hasOwnProperty(username)) {
        self.users[username] = username;
        self.usersList.push(username);
    }

};
Chatroom.prototype.updateHistory = function(message) {
    var self = this;
    self.history.addMessage(message);
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
    self.data.slice(-100);
};

/**
 * Message object
 * @desc: Chatroom message format 
 */
function Message(chatroomID, username, text, timestamp) {
    this.chatroomID = chatroomID;
    this.type = "message";
    this.data = {};
    this.data.username = username;
    this.data.text = text;
    this.data.timestamp = ""; // Will figure this out later
}

/**
 * Helper function for debugging contents of objects
 */
function printObj(obj) {
    for (var key in obj) {
        console.log(key + ": " + obj[key]);
    }
}