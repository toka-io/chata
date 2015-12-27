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
	this.socketToChatroom = {};

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

	    self.loadState();

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
	        console.log((new Date()) + " New connection from " + socket.request.connection.remoteAddress);
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

	// Accepted Events
	// join, leave, activeViewerCount, users, history, sendMessage, disconnect
	// 
	// Events Sent
	// joined, left, activeViewerCount, users, history, receiveMessage
	// 
	this.socketEvents = function(socket) {
		socket.on('join', function(json) { // Currently set up for single socket
			if (typeof json.chatroomId === "string" && json.chatroomId.trim().length > 0) {
				var chatroomId = json.chatroomId.trim();
				if (!self.chatrooms.hasOwnProperty(chatroomId)) {
					self.chatrooms[chatroomId] = new Chatroom(chatroomId);
				}
				if(typeof json.username === "string" && json.username.trim().length > 0) {
					self.chatrooms[chatroomId].addUser(json.username.trim(), socket);
				} else {
					self.chatrooms[chatroomId].addSocket(socket);
				}

				if (!self.socketToChatroom.hasOwnProperty(socket.id)) {
					self.socketToChatroom[socket.id] = [];
				}
				self.socketToChatroom[socket.id].push(chatroomId);

				if(typeof json.username === "string" && json.username.trim().length > 0) {
					socket.emit('joined', {'chatroomId': chatroomId, 'username': json.username.trim()});
					console.log((new Date()) + " [Chatroom " + chatroomId + "] " + json.username.trim() + " joined");
				} else {
					socket.emit('joined', {'chatroomId': chatroomId});
					console.log((new Date()) + " [Chatroom " + chatroomId + "] Unknown joined");
				}
			}
		});

		socket.on('leave', function(json) { // Currently set up for single socket
			if (typeof json.chatroomId === "string" && json.chatroomId.trim().length > 0) {
				if (self.chatrooms.hasOwnProperty(json.chatroomId.trim())) {
					if (self.socketToChatroom.hasOwnProperty(socket.id)) {
						if (self.socketToChatroom[socket.id].indexOf(json.chatroomId.trim())) {
							self.chatrooms[json.chatroomId.trim()].removeSocket(socket.id);
							self.socketToChatroom[socket.id].splice(self.socketToChatroom[socket.id].indexOf(json.chatroomId.trim()), 1);
							console.log((new Date()) + " [Chatroom " + json.chatroomId.trim() + "] left");
						}
					}
				}
			}
		});

		socket.on('activeViewerCount', function(json) {
			if (typeof json.chatroomId === "string" && json.chatroomId.trim().length > 0) {
				var chatroomId = json.chatroomId.trim();
				if (self.chatrooms.hasOwnProperty(json.chatroomId.trim())) {
					if (self.chatrooms[chatroomId]) {
						console.log((new Date()) + " Client @ " + socket.request.connection.remoteAddress + " [Chatroom " + json.chatroomId + "] requested active viewer count");
						socket.emit('activeViewerCount', {'chatroomId': chatroomId, 'activeViewerCount': self.chatrooms[chatroomId].activeViewerCount});
					}
				}
			}
		});

		socket.on('users', function(json) {
			if (typeof json.chatroomId === "string" && json.chatroomId.trim().length > 0) {
				if (self.chatrooms.hasOwnProperty(json.chatroomId.trim())) {
					console.log((new Date()) + " Client @ " + socket.request.connection.remoteAddress + " [Chatroom " + json.chatroomId + "] requested all usernames");
					socket.emit('users', {'chatroomId': json.chatroomId.trim(), 'users': self.chatrooms[json.chatroomId.trim()].usernames});
				}
			}
		});

		socket.on('history', function(json) {
			if (typeof json.chatroomId === "string" && json.chatroomId.trim().length > 0) {
				if (self.chatrooms.hasOwnProperty(json.chatroomId.trim())) {
					socket.emit('history', self.chatrooms[json.chatroomId.trim()].history);
				}
			}
		});

		socket.on('sendMessage', function(json) {
			var message = new Message
			message.populate(json);
			if (self.chatrooms.hasOwnProperty(message.chatroomId)) {
				console.log((new Date()) + " [Chatroom " + message.chatroomId + "] Received message from " + message.username + ": " + message.text);
				self.chatrooms[message.chatroomId].sendMessage(message, socket.id);
			}
		});

		socket.on('disconnect', function() {
			if (self.socketToChatroom.hasOwnProperty(socket.id)) {
				var chatrooms = self.socketToChatroom[socket.id]
				for (var i = 0; i < chatrooms.length; i++) {
					self.chatrooms[chatrooms[i]].removeSocket(socket.id);
					delete self.socketToChatroom[socket.id];
				}
			}
			console.log((new Date()) + " Client @ " + socket.request.connection.remoteAddress + " disconnected");
			delete self.sockets[socket.id];
		});
	}

	this.loadState = function() {
	    console.log((new Date()) + " Loading save state...");

	    var chatrooms = JSON.parse(fs.readFileSync('data/save.json').toString());
	    var loadedChatrooms = {};

	    for (var chatroomId in chatrooms) {
	        loadedChatrooms[chatroomId] = new Chatroom(chatroomId);
	        loadedChatrooms[chatroomId].history.data = chatrooms[chatroomId].history;
	    }
	    self.chatrooms = loadedChatrooms;

	    console.log((new Date()) + " Save state loaded");
	}

	this.saveState = function() {
	    console.log((new Date()) + " Saving chata state...");

		var chatrooms = {};
	    for (var chatroomId in self.chatrooms) {
	        chatrooms[chatroomId] = {
	       		'history': self.chatrooms[chatroomId].history.data
	        };
	    }

	    fs.writeFileSync('data/save.json', JSON.stringify(chatrooms));
	    console.log((new Date()) + " Chata state saved");
	}
}

// Message Object
function Message() {
	this.chatroomId;
	this.username;
	this.text;
	this.timestamp;

	var self = this;

	this.addChatroomId = function(chatroomId) {
		if (typeof chatroomId === "string") {
			self.chatroomId = chatroomId.trim();
			return true;
		} else {
			return false;
		}
	}

	this.addUsername = function(username) {
		if (typeof username === "string") {
			self.username = username.trim();
			return true;
		} else {
			return false;
		}
	}

	this.addText = function(text) {
		if (typeof text === "string") {
			self.text = text;
			return true;
		} else {
			return false;
		}
	}

	this.addTimestamp = function(timestamp) {
		if (moment(timestamp).isValid()) {
			self.timestamp = timestamp;
			return true;
		} else {
			return false;
		}
	}

	this.populate = function(json) {
		if (self.validateJson(json)){
			self.chatroomId = json.chatroomId.trim();
			self.username = json.username.trim();
			self.text = json.text;
			if (json.timestamp) {
				self.timestamp = json.timestamp;
			} else {
				self.timestamp = moment().utc().format('MMM D, YYYY h:mm a');
			}
		} else {
			return false;
		}
	}

	this.validateJson = function(json) {
		try {
		    if (typeof json.chatroomId !== "string") {
		        return false;
		    }
		    if (typeof json.text !== "string") {
		        return false;
			}
		    if (typeof json.username !== "string") {
		        return false;
		    }
		    if (json.timestamp) {
		    	if (typeof json.timestamp !== "string")
		    		return false;
		    }
		} catch (err) {
		    return false;
		}
		return true;
	}
}

// Chatroom Object
function Chatroom(chatroomId) {
	this.chatroomId = chatroomId;
	this.history = new History(chatroomId);
	this.users = {};
	this.sockets = {};
	this.socketToUser = {};
	this.usernames = [];
	this.activeViewerCount = 0;

	var self = this;

	this.addSocket = function(socket) {
		if (!self.sockets.hasOwnProperty(socket.id)) {
			self.sockets[socket.id] = socket;
			self.activeViewerCount++;
		}
	}

	this.addUser = function(username, socket) {
		if (!self.sockets.hasOwnProperty(socket.id)) {
			self.sockets[socket.id] = socket;
			self.activeViewerCount++;
		}
		if (!self.users.hasOwnProperty(username)) {
			self.users[username] = new User(username);
			self.users[username].addSocket(socket);

			self.socketToUser[socket.id] = username;

			if (self.usernames.indexOf(username) == -1) {
				self.usernames.push(username);
			}
		}
	}

	this.removeAllSockets = function(username) {
		if (self.users.hasOwnProperty(username)) {
			var sockets = self.users[username].sockets;
			for (var i = 0; i < sockets.length; i++) {
				if (self.sockets.hasOwnProperty(sockets[i])) {
					self.sockets[sockets[i]].emit('left', {'chatroomId': chatroomId, 'username': username});
					delete self.sockets[sockets[i]];
					delete self.socketToUser[sockets[i]];
					self.activeViewerCount--;
				}
			}
			self.usernames.splice(self.usernames.indexOf(username), 1);
		}
	}

	this.removeSocket = function(socketId) {
		if (self.sockets.hasOwnProperty(socketId)) {
			if (self.socketToUser.hasOwnProperty(socketId)) {
				var username = self.socketToUser[socketId];
				self.users[username].removeSocket(socketId);
				if (self.users[username].sockets.length == 0) {
					self.usernames.splice(self.usernames.indexOf(username), 1);
					delete self.users[username];
					delete self.socketToUser[socketId];
				}
			}
			delete self.sockets[socketId];
			self.activeViewerCount--;
		}
	}

	this.sendMessage = function(message, socketId) {
		try {
			message.addUsername(self.socketToUser[socketId]);
		} catch(err){
		}
		for (var socket in self.sockets) {
			if (self.sockets[socket].id != socketId) {
				self.sockets[socket].emit('receiveMessage', message);
			}
		}
		self.addHistory(message);
	}

	this.addHistory = function(message) {
		self.history.addMessage(message);
	}
}

// User Object
function User(username) {
	this.username = username;
	this.sockets = [];

	var self = this;

	this.addSocket = function(socket) {
		if (self.sockets.indexOf(socket.id) == -1) {
			self.sockets.push(socket.id);
		}
	}

	this.removeSocket = function(socketId) {
		if (self.sockets.indexOf(socketId) != -1) {
			self.sockets.splice(self.sockets.indexOf(socketId), 1);
		}
	}
}

// History Object
function History(chatroomId) {
	this.chatroomId = chatroomId;
	this.data = [];

	var self = this;

	this.addMessage = function(message) {
		self.data.push(message);
		self.data = self.data.slice(-250);
	}
}