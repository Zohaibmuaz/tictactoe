const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const randomQueue = [];
const privateRooms = new Map(); // code -> socket
const rooms = new Map(); // roomId -> room data

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for(let i=0; i<5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

function startGame(player1, player2) {
    const roomId = `room-${player1.id}-${player2.id}`;
    const players = [
        { id: player1.id, name: player1.playerName, char: player1.playerChar, symbol: 'X', color: '#ff4d4d' },
        { id: player2.id, name: player2.playerName, char: player2.playerChar, symbol: 'O', color: '#00d2ff' }
    ];
    
    rooms.set(roomId, {
        players: [player1.id, player2.id],
        board: Array(9).fill(null),
        turn: 0
    });

    player1.join(roomId);
    player2.join(roomId);

    io.to(roomId).emit('gameStart', { roomId, players });
    console.log(`Game started in room: ${roomId}`);
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinRandom', ({ name, char }) => {
        socket.playerName = name;
        socket.playerChar = char;
        socket.gameMode = 'random';
        console.log(`Player ${name} (${char}) queued for random match.`);

        if (randomQueue.length > 0) {
            const opponent = randomQueue.shift();
            startGame(opponent, socket);
        } else {
            randomQueue.push(socket);
            socket.emit('waiting', 'Searching for a random opponent...');
        }
    });

    socket.on('createPrivateRoom', ({ name, char }) => {
        socket.playerName = name;
        socket.playerChar = char;
        socket.gameMode = 'private';

        let code = generateCode();
        while(privateRooms.has(code)) code = generateCode();
        
        privateRooms.set(code, socket);
        socket.privateRoomCode = code;
        
        console.log(`Player ${name} created private room: ${code}`);
        socket.emit('roomCreated', { code });
    });

    socket.on('joinPrivateRoom', ({ name, char, code }) => {
        const uppercaseCode = code.toUpperCase();
        console.log(`Player ${name} attempting to join room: ${uppercaseCode}`);

        if (privateRooms.has(uppercaseCode)) {
            const opponent = privateRooms.get(uppercaseCode);
            privateRooms.delete(uppercaseCode); // Room is now active, remove from waiting
            
            socket.playerName = name;
            socket.playerChar = char;
            socket.gameMode = 'private';
            
            startGame(opponent, socket);
        } else {
            socket.emit('errorMsg', 'Invalid or expired room code.');
        }
    });

    socket.on('cancelWaiting', () => {
        if (socket.gameMode === 'random') {
            const index = randomQueue.indexOf(socket);
            if (index !== -1) randomQueue.splice(index, 1);
        } else if (socket.gameMode === 'private' && socket.privateRoomCode) {
            privateRooms.delete(socket.privateRoomCode);
            socket.privateRoomCode = null;
        }
        socket.gameMode = null;
    });

    socket.on('makeMove', ({ roomId, index }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const playerIndex = room.players.indexOf(socket.id);
        if (playerIndex !== room.turn) return;

        if (room.board[index] === null) {
            const symbol = playerIndex === 0 ? 'X' : 'O';
            room.board[index] = symbol;
            room.turn = 1 - room.turn;

            io.to(roomId).emit('moveMade', {
                index,
                symbol,
                nextTurn: room.players[room.turn]
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Remove from waiting lists
        const queueIndex = randomQueue.indexOf(socket);
        if (queueIndex !== -1) randomQueue.splice(queueIndex, 1);
        
        if (socket.privateRoomCode) {
            privateRooms.delete(socket.privateRoomCode);
        }

        // Notify opponent in active game
        for (const [roomId, room] of rooms.entries()) {
            if (room.players.includes(socket.id)) {
                socket.to(roomId).emit('opponentDisconnected');
                rooms.delete(roomId);
                break;
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server running at port: ${PORT}`);
});