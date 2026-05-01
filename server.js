const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

let waitingPlayer = null;
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('joinGame', ({ name, char }) => {
        console.log(`Player ${name} (${char}) joining...`);
        socket.playerName = name;
        socket.playerChar = char;

        if (waitingPlayer && waitingPlayer.id !== socket.id) {
            const roomId = `room-${waitingPlayer.id}-${socket.id}`;
            const players = [
                { id: waitingPlayer.id, name: waitingPlayer.playerName, char: waitingPlayer.playerChar, symbol: 'X', color: '#d9b38c' },
                { id: socket.id, name: socket.playerName, char: socket.playerChar, symbol: 'O', color: '#a67c52' }
            ];
            
            rooms.set(roomId, {
                players: [waitingPlayer.id, socket.id],
                board: Array(9).fill(null),
                turn: 0
            });

            waitingPlayer.join(roomId);
            socket.join(roomId);

            io.to(roomId).emit('gameStart', { roomId, players });
            console.log(`Game started in room: ${roomId}`);
            waitingPlayer = null;
        } else {
            waitingPlayer = socket;
            socket.emit('waiting', 'Searching for opponent...');
            console.log(`${name} is now waiting for an opponent.`);
        }
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
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }

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
    console.log(`Server running at http://localhost:${PORT}`);
});
