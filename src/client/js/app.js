var io = require('socket.io-client');
var render = require('./render');
var ChatClient = require('./chat-client');
var Canvas = require('./canvas');
var global = require('./global');
var AnimationManager = require('./animation-manager');


var playerNameInput = document.getElementById('playerNameInput');
var socket;

var debug = function (args) {
    if (console && console.log) {
        console.log(args);
    }
};

if (/Android|webOS|iPhone|iPad|iPod|BlackBerry/i.test(navigator.userAgent)) {
    global.mobile = true;
}

function startGame(type) {
    global.playerName = playerNameInput.value.replace(/(<([^>]+)>)/ig, '').substring(0, 25);
    global.playerType = type;

    global.screen.width = window.innerWidth;
    global.screen.height = window.innerHeight;

    document.getElementById('startMenuWrapper').style.maxHeight = '0px';
    document.getElementById('gameAreaWrapper').style.opacity = 1;
    if (!socket) {
        socket = io({ query: "type=" + type });
        setupSocket(socket);
    }
    if (!global.animLoopHandle)
        animloop();
    socket.emit('respawn');
    window.chat.socket = socket;
    window.chat.registerFunctions();
    window.canvas.socket = socket;
    global.socket = socket;
}

// Checks if the nick chosen contains valid alphanumeric characters (and underscores).
function validNick() {
    var regex = /^\w*$/;
    debug('Regex Test', regex.exec(playerNameInput.value));
    return regex.exec(playerNameInput.value) !== null;
}

// Settings Manager with localStorage
var SettingsManager = {
    // Default settings
    defaults: {
        borderDraw: false,
        toggleMassState: 0,
        continuity: false,
        foodSides: 10,
        darkMode: false
    },
    
    // Load settings from localStorage
    load: function() {
        try {
            var saved = localStorage.getItem('agarCloneSettings');
            if (saved) {
                var settings = JSON.parse(saved);
                
                // Apply to global variables
                global.borderDraw = settings.borderDraw !== undefined ? settings.borderDraw : this.defaults.borderDraw;
                global.toggleMassState = settings.toggleMassState !== undefined ? settings.toggleMassState : this.defaults.toggleMassState;
                global.continuity = settings.continuity !== undefined ? settings.continuity : this.defaults.continuity;
                global.foodSides = settings.foodSides !== undefined ? settings.foodSides : this.defaults.foodSides;
                
                // Apply dark mode
                if (settings.darkMode) {
                    global.backgroundColor = '#181818';
                    global.lineColor = '#ffffff';
                } else {
                    global.backgroundColor = '#f2fbff';
                    global.lineColor = '#000000';
                }
                
                console.log('Settings loaded from localStorage:', settings);
                return settings;
            }
        } catch (error) {
            console.warn('Failed to load settings from localStorage:', error);
        }
        
        // Return defaults if loading failed
        return this.defaults;
    },
    
    // Save settings to localStorage
    save: function() {
        try {
            var settings = {
                borderDraw: global.borderDraw,
                toggleMassState: global.toggleMassState,
                continuity: global.continuity,
                foodSides: global.foodSides,
                darkMode: global.backgroundColor === '#181818'
            };
            
            localStorage.setItem('agarCloneSettings', JSON.stringify(settings));
            console.log('Settings saved to localStorage:', settings);
        } catch (error) {
            console.warn('Failed to save settings to localStorage:', error);
        }
    },
    
    // Update checkbox states to match loaded settings
    updateCheckboxes: function(settings) {
        var visBord = document.getElementById('visBord');
        var showMass = document.getElementById('showMass');
        var continuity = document.getElementById('continuity');
        var roundFood = document.getElementById('roundFood');
        var darkMode = document.getElementById('darkMode');
        
        if (visBord) visBord.checked = settings.borderDraw;
        if (showMass) showMass.checked = settings.toggleMassState === 1;
        if (continuity) continuity.checked = settings.continuity;
        if (roundFood) roundFood.checked = settings.foodSides === 10;
        if (darkMode) darkMode.checked = settings.darkMode;
    }
};

var animationManager = new AnimationManager();
var lastCellSizes = new Map(); // cellId -> last known radius

window.onload = function () {

    // Load saved settings first
    var savedSettings = SettingsManager.load();
    
    // Update checkboxes to match loaded settings
    SettingsManager.updateCheckboxes(savedSettings);

    var btn = document.getElementById('startButton'),
        btnS = document.getElementById('spectateButton'),
        nickErrorText = document.querySelector('#startMenu .input-error');

    btnS.onclick = function () {
        startGame('spectator');
    };

    btn.onclick = function () {

        // Checks if the nick is valid.
        if (validNick()) {
            nickErrorText.style.opacity = 0;
            startGame('player');
        } else {
            nickErrorText.style.opacity = 1;
        }
    };

    var settingsMenu = document.getElementById('settingsButton');
    var settings = document.getElementById('settings');

    settingsMenu.onclick = function () {
        if (settings.style.maxHeight == '300px') {
            settings.style.maxHeight = '0px';
        } else {
            settings.style.maxHeight = '300px';
        }
    };

    playerNameInput.addEventListener('keypress', function (e) {
        var key = e.which || e.keyCode;

        if (key === global.KEY_ENTER) {
            if (validNick()) {
                nickErrorText.style.opacity = 0;
                startGame('player');
            } else {
                nickErrorText.style.opacity = 1;
            }
        }
    });
};

// TODO: Break out into GameControls.

var playerConfig = {
    border: 6,
    textColor: '#FFFFFF',
    textBorder: '#000000',
    textBorderSize: 3,
    defaultSize: 30
};

var player = {
    id: -1,
    x: global.screen.width / 2,
    y: global.screen.height / 2,
    screenWidth: global.screen.width,
    screenHeight: global.screen.height,
    target: { x: global.screen.width / 2, y: global.screen.height / 2 }
};
global.player = player;

var foods = [];
var viruses = [];
var fireFood = [];
var users = [];
var leaderboard = [];
var target = { x: player.x, y: player.y };
global.target = target;

window.canvas = new Canvas();
window.chat = new ChatClient();

var visibleBorderSetting = document.getElementById('visBord');
visibleBorderSetting.onchange = function() {
    global.borderDraw = this.checked;
    SettingsManager.save();
    console.log('Border setting changed to:', this.checked);
};

var showMassSetting = document.getElementById('showMass');
showMassSetting.onchange = function() {
    global.toggleMassState = this.checked ? 1 : 0;
    SettingsManager.save();
    console.log('Mass display changed to:', this.checked);
};

var continuitySetting = document.getElementById('continuity');
continuitySetting.onchange = function() {
    global.continuity = this.checked;
    SettingsManager.save();
    console.log('Continuity changed to:', this.checked);
};

var roundFoodSetting = document.getElementById('roundFood');
roundFoodSetting.onchange = function() {
    global.foodSides = this.checked ? 10 : 5;
    SettingsManager.save();
    console.log('Round food changed to:', this.checked);
};

var darkModeSetting = document.getElementById('darkMode');
if (darkModeSetting) {
    darkModeSetting.onchange = function() {
        if (this.checked) {
            global.backgroundColor = '#181818';
            global.lineColor = '#ffffff';
            console.log('Dark mode enabled');
        } else {
            global.backgroundColor = '#f2fbff';
            global.lineColor = '#000000';
            console.log('Dark mode disabled');
        }
        SettingsManager.save();
    };
}

var c = window.canvas.cv;
var graph = c.getContext('2d');

document.getElementById("feed").addEventListener("click", () => {
    socket.emit('1');
    window.canvas.reenviar = false;
});

document.getElementById("split").addEventListener("click", () => {
    socket.emit('2');
    window.canvas.reenviar = false;
});

function handleDisconnect() {
    socket.close();
    if (!global.kicked) { // We have a more specific error message 
        render.drawErrorMessage('Disconnected!', graph, global.screen);
    }
}

// socket stuff.
function setupSocket(socket) {
    // Handle ping.
    socket.on('pongcheck', function () {
        var latency = Date.now() - global.startPingTime;
        debug('Latency: ' + latency + 'ms');
        window.chat.addSystemLine('Ping: ' + latency + 'ms');
    });

    // Handle error.
    socket.on('connect_error', handleDisconnect);
    socket.on('disconnect', handleDisconnect);

    // Handle connection.
    socket.on('welcome', function (playerSettings, gameSizes) {
        player = playerSettings;
        player.name = global.playerName;
        player.screenWidth = global.screen.width;
        player.screenHeight = global.screen.height;
        player.target = window.canvas.target;
        global.player = player;
        window.chat.player = player;
        socket.emit('gotit', player);
        global.gameStart = true;
        window.chat.addSystemLine('Connected to the game!');
        window.chat.addSystemLine('Type <b>-help</b> for a list of commands.');
        if (global.mobile) {
            document.getElementById('gameAreaWrapper').removeChild(document.getElementById('chatbox'));
        }
        c.focus();
        global.game.width = gameSizes.width;
        global.game.height = gameSizes.height;
        resize();
    });

    socket.on('playerDied', (data) => {
        const player = isUnnamedCell(data.playerEatenName) ? 'An unnamed cell' : data.playerEatenName;
        //const killer = isUnnamedCell(data.playerWhoAtePlayerName) ? 'An unnamed cell' : data.playerWhoAtePlayerName;

        //window.chat.addSystemLine('{GAME} - <b>' + (player) + '</b> was eaten by <b>' + (killer) + '</b>');
        window.chat.addSystemLine('{GAME} - <b>' + (player) + '</b> was eaten');
    });

    socket.on('playerDisconnect', (data) => {
        window.chat.addSystemLine('{GAME} - <b>' + (isUnnamedCell(data.name) ? 'An unnamed cell' : data.name) + '</b> disconnected.');
    });

    socket.on('playerJoin', (data) => {
        window.chat.addSystemLine('{GAME} - <b>' + (isUnnamedCell(data.name) ? 'An unnamed cell' : data.name) + '</b> joined.');
    });

    socket.on('leaderboard', (data) => {
        leaderboard = data.leaderboard;
        var status = '<span class="title">Leaderboard</span>';
        for (var i = 0; i < leaderboard.length; i++) {
            status += '<br />';
            if (leaderboard[i].id == player.id) {
                if (leaderboard[i].name.length !== 0)
                    status += '<span class="me">' + (i + 1) + '. ' + leaderboard[i].name + "</span>";
                else
                    status += '<span class="me">' + (i + 1) + ". An unnamed cell</span>";
            } else {
                if (leaderboard[i].name.length !== 0)
                    status += (i + 1) + '. ' + leaderboard[i].name;
                else
                    status += (i + 1) + '. An unnamed cell';
            }
        }
        //status += '<br />Players: ' + data.players;
        document.getElementById('status').innerHTML = status;
    });

    socket.on('serverMSG', function (data) {
        window.chat.addSystemLine(data);
    });

    // Chat.
    socket.on('serverSendPlayerChat', function (data) {
        window.chat.addChatLine(data.sender, data.message, false);
    });

    // Handle movement.
    socket.on('serverTellPlayerMove', function (playerData, userData, foodsList, massList, virusList) {
        if (global.playerType == 'player') {
            player.x = playerData.x;
            player.y = playerData.y;
            player.hue = playerData.hue;
            player.massTotal = playerData.massTotal;
            player.cells = playerData.cells;
        }
        users = userData;
        foods = foodsList;
        viruses = virusList;
        fireFood = massList;
    });

    // Death.
    socket.on('RIP', function () {
        global.gameStart = false;
        render.drawErrorMessage('You died!', graph, global.screen);
        window.setTimeout(() => {
            document.getElementById('gameAreaWrapper').style.opacity = 0;
            document.getElementById('startMenuWrapper').style.maxHeight = '1000px';
            if (global.animLoopHandle) {
                window.cancelAnimationFrame(global.animLoopHandle);
                global.animLoopHandle = undefined;
            }
        }, 2500);
    });

    socket.on('kick', function (reason) {
        global.gameStart = false;
        global.kicked = true;
        if (reason !== '') {
            render.drawErrorMessage('You were kicked for: ' + reason, graph, global.screen);
        }
        else {
            render.drawErrorMessage('You were kicked!', graph, global.screen);
        }
        socket.close();
    });
}

const isUnnamedCell = (name) => name.length < 1;

const getPosition = (entity, player, screen) => {
    return {
        x: entity.x - player.x + screen.width / 2,
        y: entity.y - player.y + screen.height / 2
    }
}

window.requestAnimFrame = (function () {
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function (callback) {
            window.setTimeout(callback, 1000 / 60);
        };
})();

window.cancelAnimFrame = (function (handle) {
    return window.cancelAnimationFrame ||
        window.mozCancelAnimationFrame;
})();

function animloop() {
    global.animLoopHandle = window.requestAnimFrame(animloop);
    gameLoop();
}

function gameLoop() {
    if (global.gameStart) {
        graph.fillStyle = global.backgroundColor;
        graph.fillRect(0, 0, global.screen.width, global.screen.height);

        render.drawGrid(global, player, global.screen, graph);
        
        // Draw food
        foods.forEach(food => {
            let position = getPosition(food, player, global.screen);
            render.drawFood(position, food, graph);
        });
        
        // Draw fire food
        fireFood.forEach(fireFood => {
            let position = getPosition(fireFood, player, global.screen);
            render.drawFireFood(position, fireFood, playerConfig, graph);
        });

        let borders = {
            left: global.screen.width / 2 - player.x,
            right: global.screen.width / 2 + global.game.width - player.x,
            top: global.screen.height / 2 - player.y,
            bottom: global.screen.height / 2 + global.game.height - player.y
        }

        // Process cells and separate by size
        var smallCells = [];  // Below splitMass (behind viruses)
        var largeCells = [];  // Above splitMass (above viruses)

        for (var i = 0; i < users.length; i++) {
            let color = 'hsl(' + users[i].hue + ', 100%, 50%)';
            let borderColor = 'hsl(' + users[i].hue + ', 100%, 45%)';
            
            for (var j = 0; j < users[i].cells.length; j++) {
                const cell = users[i].cells[j];
                const cellId = users[i].id + '_' + j;
                
                // Animation logic (if you implemented smooth growth)
                const serverRadius = cell.radius;
                const lastRadius = lastCellSizes.get(cellId);
                let displayRadius = serverRadius;
                
                if (typeof animationManager !== 'undefined') {
                    if (lastRadius !== undefined && Math.abs(serverRadius - lastRadius) > global.growthAnimation.minSizeChange) {
                        displayRadius = animationManager.startGrowthAnimation(cellId, lastRadius, serverRadius);
                    } else {
                        displayRadius = animationManager.updateAndGetRadius(cellId, serverRadius);
                    }
                }
                
                lastCellSizes.set(cellId, serverRadius);
                
                const cellData = {
                    color: color,
                    borderColor: borderColor,
                    mass: cell.mass,
                    name: users[i].name,
                    radius: displayRadius,
                    serverRadius: serverRadius,
                    x: cell.x - player.x + global.screen.width / 2,
                    y: cell.y - player.y + global.screen.height / 2
                };
                
                // Split based on mass threshold
                const splitMassThreshold = 133; // Match your server config
                
                if (cell.mass >= splitMassThreshold) {
                    largeCells.push(cellData);
                } else {
                    smallCells.push(cellData);
                }
            }
        }

        // Sort for proper layering
        smallCells.sort(function (obj1, obj2) {
            return obj1.mass - obj2.mass;
        });
        largeCells.sort(function (obj1, obj2) {
            return obj1.mass - obj2.mass;
        });

        // LAYER 1: Draw small cells (behind viruses)
        render.drawCells(smallCells, playerConfig, global.toggleMassState, borders, graph);

        // LAYER 2: Draw viruses (above small cells, below large cells)
        viruses.forEach(virus => {
            let position = getPosition(virus, player, global.screen);
            render.drawVirus(position, virus, graph);
        });

        // LAYER 3: Draw large cells (above viruses)
        render.drawCells(largeCells, playerConfig, global.toggleMassState, borders, graph);

        // Draw border last
        if (global.borderDraw) {
            render.drawBorder(borders, graph);
        }

        // Cleanup animations periodically
        if (Math.random() < 0.01) {
            if (typeof animationManager !== 'undefined') {
                animationManager.cleanup();
            }
            
            const activeCellIds = new Set();
            users.forEach(user => {
                user.cells.forEach((cell, index) => {
                    activeCellIds.add(user.id + '_' + index);
                });
            });
            
            for (let cellId of lastCellSizes.keys()) {
                if (!activeCellIds.has(cellId)) {
                    lastCellSizes.delete(cellId);
                }
            }
        }

        socket.emit('0', window.canvas.target);
    }
}

window.addEventListener('resize', resize);

function resize() {
    if (!socket) return;

    player.screenWidth = c.width = global.screen.width = global.playerType == 'player' ? window.innerWidth : global.game.width;
    player.screenHeight = c.height = global.screen.height = global.playerType == 'player' ? window.innerHeight : global.game.height;

    if (global.playerType == 'spectator') {
        player.x = global.game.width / 2;
        player.y = global.game.height / 2;
    }

    socket.emit('windowResized', { screenWidth: global.screen.width, screenHeight: global.screen.height });
}
