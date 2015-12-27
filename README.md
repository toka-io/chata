
# Chata

## What is Chata?
Chata is a simple chat server solution. 

The chat server can run on any available port (default is 1337) and supports the following events:

### Server Events
- connect
- disconnect
	- Same effect as leave
- activeViewerCount
- join
- leave
- sendMessage
	- Sends a reciveMessage to all other sockets
- users

### Client Events
- joined
- left
	- Only used when you are forced off a channel without instigating it.
- activeViewerCount
- history
- receiveMessage
- users