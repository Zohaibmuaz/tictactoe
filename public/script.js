const socket = io();

// UI Elements
const setupScreen = document.getElementById('setup-screen');
const nameSection = document.getElementById('name-section');
const modeSection = document.getElementById('mode-section');
const friendSection = document.getElementById('friend-section');
const waitingSection = document.getElementById('waiting-section');

const nameInput = document.getElementById('name-input');
const nextBtn = document.getElementById('next-btn');

const quickMatchBtn = document.getElementById('quick-match-btn');
const playFriendBtn = document.getElementById('play-friend-btn');
const backNameBtn = document.getElementById('back-name-btn');

const createRoomBtn = document.getElementById('create-room-btn');
const roomCodeInput = document.getElementById('room-code-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const backModeBtn = document.getElementById('back-mode-btn');

const waitingMessage = document.getElementById('waiting-message');
const roomCodeDisplay = document.getElementById('room-code-display');
const cancelWaitingBtn = document.getElementById('cancel-waiting-btn');

// Game Elements
const gameContainer = document.getElementById('game-container');
const themeBtn = document.getElementById('theme-btn');
const cells = document.querySelectorAll('.cell');
const statusBadge = document.getElementById('status-badge');
const myNameDisplay = document.getElementById('my-name');
const opponentNameDisplay = document.getElementById('opponent-name');
const myAvatar = document.getElementById('my-avatar');
const opponentAvatar = document.getElementById('opponent-avatar');
const playerMeSlot = document.getElementById('player-me');
const playerOpponentSlot = document.getElementById('player-opponent');
const myTimerRing = document.getElementById('my-timer');
const opponentTimerRing = document.getElementById('opponent-timer');
const resetBtn = document.getElementById('reset');
const downloadBtn = document.getElementById('download-btn');

// Game State
let myInfo = { name: '', symbol: '', char: '', color: '' };
let opponentInfo = { name: '', symbol: '', char: '', color: '' };
let roomId = null;
let gameActive = false;
let myTurn = false;
let boardState = Array(9).fill(null);
let turnTimer = null;
let timeLeft = 15;

// Theme Toggle
themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-theme');
    document.body.classList.toggle('light-theme');
});

// Navigation Flow
function hideAllSections() {
    nameSection.classList.add('hidden');
    modeSection.classList.add('hidden');
    friendSection.classList.add('hidden');
    waitingSection.classList.add('hidden');
}

nextBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (name) {
        myInfo.name = name;
        myInfo.char = name.charAt(0).toUpperCase();
        myNameDisplay.textContent = name;
        myAvatar.textContent = myInfo.char;
        hideAllSections();
        modeSection.classList.remove('hidden');
    }
});

backNameBtn.addEventListener('click', () => {
    hideAllSections();
    nameSection.classList.remove('hidden');
});

quickMatchBtn.addEventListener('click', () => {
    hideAllSections();
    waitingMessage.textContent = 'Searching for a random opponent...';
    roomCodeDisplay.classList.add('hidden');
    waitingSection.classList.remove('hidden');
    socket.emit('joinRandom', { name: myInfo.name, char: myInfo.char });
});

playFriendBtn.addEventListener('click', () => {
    hideAllSections();
    friendSection.classList.remove('hidden');
});

backModeBtn.addEventListener('click', () => {
    hideAllSections();
    modeSection.classList.remove('hidden');
});

createRoomBtn.addEventListener('click', () => {
    hideAllSections();
    waitingMessage.textContent = 'Share this code with your friend:';
    roomCodeDisplay.textContent = '...';
    roomCodeDisplay.classList.remove('hidden');
    waitingSection.classList.remove('hidden');
    socket.emit('createPrivateRoom', { name: myInfo.name, char: myInfo.char });
});

joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code.length === 5) {
        socket.emit('joinPrivateRoom', { name: myInfo.name, char: myInfo.char, code });
    } else {
        alert("Please enter a valid 5-letter code.");
    }
});

cancelWaitingBtn.addEventListener('click', () => {
    socket.emit('cancelWaiting');
    hideAllSections();
    modeSection.classList.remove('hidden');
});

// Socket Event Listeners
socket.on('errorMsg', (msg) => {
    alert(msg);
});

socket.on('roomCreated', ({ code }) => {
    roomCodeDisplay.textContent = code;
});

socket.on('waiting', (msg) => {
    waitingMessage.textContent = msg;
    roomCodeDisplay.classList.add('hidden');
});

socket.on('gameStart', ({ roomId: id, players }) => {
    setupScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    gameContainer.classList.add('fade-in');
    
    roomId = id;
    gameActive = true;
    boardState.fill(null);
    cells.forEach(c => {
        c.textContent = '';
        c.className = 'cell';
        c.style.color = '';
    });
    downloadBtn.classList.add('hidden');
    
    const opponent = players.find(p => p.id !== socket.id);
    const me = players.find(p => p.id === socket.id);
    
    myInfo.symbol = me.symbol;
    myInfo.char = me.char;
    myInfo.color = 'var(--player-1)';
    
    opponentInfo.name = opponent.name;
    opponentInfo.char = opponent.char;
    opponentInfo.symbol = opponent.symbol;
    opponentInfo.color = 'var(--player-2)';

    opponentAvatar.textContent = opponentInfo.char;
    opponentNameDisplay.textContent = opponentInfo.name;
    
    myTurn = (myInfo.symbol === 'X');
    startCountdown();
    updateUIState();
});

socket.on('moveMade', ({ index, symbol, nextTurn }) => {
    const isMe = (symbol === myInfo.symbol);
    const info = isMe ? myInfo : opponentInfo;
    const cell = cells[index];
    
    boardState[index] = symbol;
    cell.textContent = info.char;
    cell.style.color = info.color;
    cell.classList.add('taken');
    
    const winningPattern = checkWinningCondition();
    if (winningPattern) {
        stopCountdown();
        statusBadge.textContent = isMe ? "Victorious!" : "Defeated!";
        gameActive = false;
        winningPattern.forEach(i => cells[i].classList.add('win'));
        downloadBtn.classList.remove('hidden');
        if (isMe) triggerVictoryConfetti();
        return;
    }

    if (isBoardFull()) {
        stopCountdown();
        statusBadge.textContent = "It's a Draw!";
        gameActive = false;
        downloadBtn.classList.remove('hidden');
        return;
    }

    myTurn = (socket.id === nextTurn);
    startCountdown();
    updateUIState();
});

socket.on('opponentDisconnected', () => {
    statusBadge.textContent = "Opponent Fled!";
    gameActive = false;
    stopCountdown();
});

// Board Interaction
cells.forEach(cell => {
    cell.addEventListener('click', () => {
        const index = cell.getAttribute('data-index');
        if (!gameActive || !myTurn || boardState[index]) return;
        socket.emit('makeMove', { roomId, index: parseInt(index) });
    });
});

resetBtn.addEventListener('click', () => location.reload());

// Result Download Feature (Image Version)
downloadBtn.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 600;
    canvas.height = 700;

    // Background Gradient
    const gradient = ctx.createLinearGradient(0, 0, 600, 700);
    gradient.addColorStop(0, '#0f1113');
    gradient.addColorStop(1, '#1a1d21');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 600, 700);

    // Border
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, 600, 700);

    // Header
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 40px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ELITE TIC TAC TOE', 300, 80);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '24px Outfit, sans-serif';
    ctx.fillText('MATCH REPORT', 300, 120);

    // Duel Info
    ctx.fillStyle = '#8899a6';
    ctx.font = '20px Outfit, sans-serif';
    ctx.fillText(`${myInfo.name} vs ${opponentInfo.name}`, 300, 180);

    // Outcome
    ctx.fillStyle = '#ffdf00';
    ctx.font = 'bold 36px Outfit, sans-serif';
    ctx.fillText(statusBadge.textContent.toUpperCase(), 300, 240);

    // Board Drawing
    const startX = 150;
    const startY = 300;
    const cellSize = 100;
    const padding = 10;

    ctx.strokeStyle = '#3d444d';
    ctx.lineWidth = 4;

    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const x = startX + j * (cellSize + padding);
            const y = startY + i * (cellSize + padding);
            const index = i * 3 + j;

            ctx.fillStyle = '#161a1d';
            ctx.beginPath();
            ctx.roundRect(x, y, cellSize, cellSize, 15);
            ctx.fill();
            ctx.stroke();

            const symbol = boardState[index];
            if (symbol) {
                const isMe = (symbol === myInfo.symbol);
                ctx.fillStyle = isMe ? '#ff4d4d' : '#00d2ff';
                ctx.font = 'bold 50px Outfit, sans-serif';
                ctx.fillText(isMe ? myInfo.char : opponentInfo.char, x + cellSize/2, y + cellSize/2 + 18);
            }
        }
    }

    ctx.fillStyle = '#495057';
    ctx.font = 'italic 16px Outfit, sans-serif';
    ctx.fillText('Generated by Elite Tic Tac Toe', 300, 660);

    const link = document.createElement('a');
    link.download = `EliteMatch_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
});

// Utility Functions
function startCountdown() {
    stopCountdown();
    timeLeft = 15;
    renderTimer();
    turnTimer = setInterval(() => {
        timeLeft--;
        renderTimer();
        if (timeLeft <= 0) {
            stopCountdown();
            if (myTurn) statusBadge.textContent = "Time Expired!";
        }
    }, 1000);
}

function stopCountdown() {
    clearInterval(turnTimer);
}

function renderTimer() {
    const target = myTurn ? myTimerRing : opponentTimerRing;
    const idle = myTurn ? opponentTimerRing : myTimerRing;
    target.textContent = timeLeft;
    idle.textContent = "15";
}

function updateUIState() {
    statusBadge.textContent = myTurn ? "Your Turn" : "Opponent's Move";
    playerMeSlot.classList.toggle('active', myTurn);
    playerOpponentSlot.classList.toggle('active', !myTurn);
}

function checkWinningCondition() {
    const winLines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
    for (let line of winLines) {
        const [a, b, c] = line;
        if (boardState[a] && boardState[a] === boardState[b] && boardState[a] === boardState[c]) return line;
    }
    return null;
}

function isBoardFull() {
    return boardState.every(cell => cell !== null);
}

function triggerVictoryConfetti() {
    const end = Date.now() + 3000;
    const colors = ['#d4af37', '#ffffff', '#ff4d4d', '#00d2ff'];

    (function frame() {
        confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 }, colors });
        confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 }, colors });
        if (Date.now() < end) requestAnimationFrame(frame);
    }());
}
