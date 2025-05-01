require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = process.env.PORT || 9000; // Update here
app.use(express.static(__dirname)); // Serve static files from the root directory
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html'); // Adjust path to index.html
});

const chatRooms = {};

// Add these variables at the top of your script
let isInCall = false;
let hasPermissions = false;

// Function to check and request permissions
async function checkAndRequestPermissions() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        stream.getTracks().forEach(track => track.stop()); // Stop the test stream
        hasPermissions = true;
        return true;
    } catch (error) {
        console.error('Permission error:', error);
        alert('Please allow camera and microphone access to make video calls.');
        return false;
    }
}

// Handle socket connections
io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle room creation
    socket.on('create room', (code) => {
        console.log('Creating room with code:', code);
        chatRooms[code] = { 
            users: [], 
            messages: [],
            videoCall: {
                active: false,
                caller: null,
                callee: null
            }
        };
        socket.join(code);
        socket.emit('joined room', code);
    });

    // Handle joining room
    socket.on('join room', (code, username) => {
        console.log('User trying to join room:', code, 'with username:', username);
        if (chatRooms[code]) {
            chatRooms[code].users.push({ id: socket.id, username: username });
            socket.join(code);
            socket.emit('joined room', code);
            socket.to(code).emit('chat message', {
                username: 'System',
                message: `${username} has joined the chat!`,
                timestamp: new Date().toLocaleTimeString(),
                roomCode: code,
                senderId: socket.id
            });
        } else {
            console.log('Room not found:', code);
            socket.emit('error', 'Room not found');
        }
    });

    // Handle video call request
    socket.on('video call request', ({ roomCode, callerUsername, offer }) => {
        const room = chatRooms[roomCode];
        if (room && !room.videoCall.active) {
            room.videoCall.active = true;
            room.videoCall.caller = socket.id;
            room.videoCall.offer = offer;
            socket.to(roomCode).emit('video call request', {
                callerId: socket.id,
                callerUsername: callerUsername,
                offer: offer
            });
        }
    });

    // Handle video call response
    socket.on('video call response', ({ roomCode, accepted, calleeUsername, answer }) => {
        const room = chatRooms[roomCode];
        if (room && room.videoCall.active) {
            if (accepted) {
                room.videoCall.callee = socket.id;
                io.to(room.videoCall.caller).emit('video call accepted', {
                    calleeId: socket.id,
                    calleeUsername: calleeUsername,
                    answer: answer
                });
            } else {
                room.videoCall.active = false;
                room.videoCall.caller = null;
                room.videoCall.offer = null;
                io.to(room.videoCall.caller).emit('video call rejected', {
                    calleeUsername: calleeUsername
                });
            }
        }
    });

    // Handle video call end
    socket.on('end video call', ({ roomCode }) => {
        const room = chatRooms[roomCode];
        if (room && room.videoCall.active) {
            room.videoCall.active = false;
            room.videoCall.caller = null;
            room.videoCall.callee = null;
            room.videoCall.offer = null;
            io.to(roomCode).emit('video call ended');
        }
    });

    // Handle WebRTC signaling
    socket.on('webrtc signal', ({ roomCode, signal, targetId }) => {
        socket.to(targetId).emit('webrtc signal', {
            signal: signal,
            senderId: socket.id
        });
    });

    socket.on('user left', ({ username, roomCode }) => {
        console.log(`${username} has left the room: ${roomCode}`);
    
        // Remove the user from the room
        chatRooms[roomCode].users = chatRooms[roomCode].users.filter(user => user.id !== socket.id);
        
        // Broadcast to the other users that the user has left
        socket.to(roomCode).emit('user left', { username });
        
        // Check if the room is now empty
        if (chatRooms[roomCode].users.length === 0) {
            delete chatRooms[roomCode];  // Clean up if no users are left in the room
        }
    });
        // Check if the room is now empty
      //----------------------------------------------------------------------- 
    // Handle chat messages
    socket.on('chat message', (data) => {
        console.log('Received chat message:', data); // Add logging
        if (chatRooms[data.roomCode]) {
            chatRooms[data.roomCode].messages.push(data); // Save message
        }
        io.to(data.roomCode).emit('chat message', data); // Send to the specific room
    });

    // Handle image sharing
    socket.on('image message', (data) => {
        console.log('Received image message:', data); // Add logging
        if (chatRooms[data.roomCode]) {
            chatRooms[data.roomCode].messages.push(data); // Save image message
        }
        io.to(data.roomCode).emit('image message', data); // Send image to the specific room
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
        // Optionally, handle user disconnection (remove from users list, etc.)
    });
});

server.listen(port, () => { // Use the port variable here
    console.log(`listening on *:${port}`);
});

