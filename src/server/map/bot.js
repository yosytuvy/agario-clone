"use strict";

const util = require('../lib/util');
const sat = require('sat');
const gameLogic = require('../game-logic');
const config = require('../../../config');

const MIN_SPEED = 6.25;
const SPEED_DECREMENT = 0.5;
const MIN_DISTANCE = 50;
const PUSHING_AWAY_SPEED = 1.1;

// Bot AI States
const BOT_STATES = {
    IDLE: 'IDLE',
    CHASING_FOOD: 'CHASING_FOOD',
    FLEEING: 'FLEEING',
    HUNTING: 'HUNTING'
};

class Cell {
    constructor(x, y, mass, speed) {
        this.x = x;
        this.y = y;
        this.mass = mass;
        this.radius = util.massToRadius(mass);
        this.speed = speed;
    }

    setMass(mass) {
        this.mass = Math.min(mass, config.bots.maxMass);
        this.recalculateRadius();
    }

    addMass(mass) {
        this.setMass(this.mass + mass);
    }

    recalculateRadius() {
        this.radius = util.massToRadius(this.mass);
    }

    toCircle() {
        return new sat.Circle(new sat.Vector(this.x, this.y), this.radius);
    }

    move(playerX, playerY, playerTarget, slowBase, initMassLog) {
        var target = {
            x: playerX - this.x + playerTarget.x,
            y: playerY - this.y + playerTarget.y
        };
        var dist = Math.hypot(target.y, target.x)
        var deg = Math.atan2(target.y, target.x);
        var slowDown = 1;
        if (this.speed <= MIN_SPEED) {
            slowDown = util.mathLog(this.mass, slowBase) - initMassLog + 1;
        }

        var deltaY = this.speed * Math.sin(deg) / slowDown;
        var deltaX = this.speed * Math.cos(deg) / slowDown;

        if (this.speed > MIN_SPEED) {
            this.speed -= SPEED_DECREMENT;
        }
        if (dist < (MIN_DISTANCE + this.radius)) {
            deltaY *= dist / (MIN_DISTANCE + this.radius);
            deltaX *= dist / (MIN_DISTANCE + this.radius);
        }

        if (!isNaN(deltaY)) {
            this.y += deltaY;
        }
        if (!isNaN(deltaX)) {
            this.x += deltaX;
        }
    }

    static checkWhoAteWho(cellA, cellB) {
        if (!cellA || !cellB) return 0;
        let response = new sat.Response();
        let colliding = sat.testCircleCircle(cellA.toCircle(), cellB.toCircle(), response);
        if (!colliding) return 0;
        
        const eatThreshold = 1.25;
    
        if (response.bInA && cellA.mass > cellB.mass * eatThreshold) return 1;
        if (response.aInB && cellB.mass > cellA.mass * eatThreshold) return 2;
        return 0;
    }
}

exports.Bot = class {
    constructor(id, botNumber) {
        this.id = id;
        this.botNumber = botNumber;
        this.hue = Math.round(Math.random() * 360);
        this.name = `Bot${Math.floor(Math.random() * 1000) + 1}`;
        this.admin = false;
        this.screenWidth = config.gameWidth;
        this.screenHeight = config.gameHeight;
        this.timeToMerge = null;
        this.lastHeartbeat = Date.now();
        
        // AI properties
        this.aiState = BOT_STATES.IDLE;
        this.aiTarget = null;
        this.aiUpdateCounter = 0;
        this.targetPersistence = 0; // How long to stick with current target
        this.maxTargetPersistence = 30; // Stick with target for 30 ticks
        
        this.isBot = true;
    }

    init(position) {
        const startMass = util.randomInRange(config.bots.startMass.from, config.bots.startMass.to);
        this.cells = [new Cell(position.x, position.y, startMass, MIN_SPEED)];
        this.massTotal = startMass;
        this.x = position.x;
        this.y = position.y;
        this.target = { x: 0, y: 0 };
    }

    setLastHeartbeat() {
        this.lastHeartbeat = Date.now();
    }

    loseMassIfNeeded(massLossRate, defaultPlayerMass, minMassLoss) {
        for (let i in this.cells) {
            if (this.cells[i].mass * (1 - (massLossRate / 1000)) > defaultPlayerMass && this.massTotal > minMassLoss) {
                var massLoss = this.cells[i].mass * (massLossRate / 1000);
                this.changeCellMass(i, -massLoss);
            }
        }
    }

    changeCellMass(cellIndex, massDifference) {
        this.cells[cellIndex].addMass(massDifference);
        this.massTotal += massDifference;
        if (this.massTotal > config.bots.maxMass) {
            const excess = this.massTotal - config.bots.maxMass;
            this.massTotal = config.bots.maxMass;
            this.cells[cellIndex].setMass(this.cells[cellIndex].mass - excess);
        }
    }

    removeCell(cellIndex) {
        this.massTotal -= this.cells[cellIndex].mass;
        this.cells.splice(cellIndex, 1);
        return this.cells.length === 0;
    }

    // Fixed Bot AI Logic
    updateAI(players, bots, food, viruses) {
        // Reduce AI update frequency for smoother movement
        this.aiUpdateCounter++;
        this.targetPersistence--;
        
        // Only update AI every 15 ticks (4 times per second) and when target persistence runs out
        if (this.aiUpdateCounter < 15 && this.targetPersistence > 0) {
            return;
        }
        this.aiUpdateCounter = 0;

        const nearbyEntities = this.findNearbyEntities(players, bots, food);
        const threats = nearbyEntities.threats;
        const prey = nearbyEntities.prey;
        const nearbyFood = nearbyEntities.food;

        // Priority: Flee from threats > Hunt prey > Chase food > Idle
        if (threats.length > 0) {
            this.aiState = BOT_STATES.FLEEING;
            this.setFleeTarget(threats);
            this.targetPersistence = this.maxTargetPersistence;
        } else if (prey.length > 0) {
            this.aiState = BOT_STATES.HUNTING;
            this.setHuntTarget(prey);
            this.targetPersistence = this.maxTargetPersistence;
        } else if (nearbyFood.length > 0) {
            this.aiState = BOT_STATES.CHASING_FOOD;
            this.setFoodTarget(nearbyFood);
            this.targetPersistence = Math.floor(this.maxTargetPersistence * 0.5); // Shorter persistence for food
        } else {
            this.aiState = BOT_STATES.IDLE;
            this.setRandomTarget();
            this.targetPersistence = this.maxTargetPersistence * 2; // Longer persistence for random movement
        }
    }

    findNearbyEntities(players, bots, food) {
        const threats = [];
        const prey = [];
        const nearbyFood = [];
        const detectionRange = config.bots.detectionRange;

        // Check players
        for (let player of players) {
            const distance = Math.hypot(player.x - this.x, player.y - this.y);
            if (distance <= detectionRange) {
                if (player.massTotal > this.massTotal * 1.1) {
                    threats.push({ entity: player, distance });
                } else if (this.massTotal > player.massTotal * 1.1) {
                    prey.push({ entity: player, distance });
                }
            }
        }

        // Check other bots
        for (let bot of bots) {
            if (bot.id === this.id) continue;
            const distance = Math.hypot(bot.x - this.x, bot.y - this.y);
            if (distance <= detectionRange) {
                if (bot.massTotal > this.massTotal * 1.1) {
                    threats.push({ entity: bot, distance });
                } else if (this.massTotal > bot.massTotal * 1.1) {
                    prey.push({ entity: bot, distance });
                }
            }
        }

        // Check food (smaller detection range)
        for (let f of food) {
            const distance = Math.hypot(f.x - this.x, f.y - this.y);
            if (distance <= detectionRange * 0.6) {
                nearbyFood.push({ entity: f, distance });
            }
        }

        return { threats, prey, food: nearbyFood };
    }

    // Fixed target setting methods
    setFleeTarget(threats) {
        // Find average position of threats and flee opposite direction
        let avgX = 0, avgY = 0;
        for (let threat of threats) {
            avgX += threat.entity.x;
            avgY += threat.entity.y;
        }
        avgX /= threats.length;
        avgY /= threats.length;

        // Calculate flee direction (opposite from threats)
        const fleeAngle = Math.atan2(this.y - avgY, this.x - avgX);
        
        // Set target as relative movement (like mouse movement)
        const moveDistance = 200; // How far to move towards flee direction
        this.target.x = Math.cos(fleeAngle) * moveDistance;
        this.target.y = Math.sin(fleeAngle) * moveDistance;
    }

    setHuntTarget(prey) {
        // Chase closest prey
        prey.sort((a, b) => a.distance - b.distance);
        const target = prey[0].entity;
        
        // Set target as relative movement towards prey
        const angle = Math.atan2(target.y - this.y, target.x - this.x);
        const moveDistance = 150;
        this.target.x = Math.cos(angle) * moveDistance;
        this.target.y = Math.sin(angle) * moveDistance;
    }

    setFoodTarget(food) {
        // Chase closest food
        food.sort((a, b) => a.distance - b.distance);
        const target = food[0].entity;
        
        // Set target as relative movement towards food
        const angle = Math.atan2(target.y - this.y, target.x - this.x);
        const moveDistance = 100;
        this.target.x = Math.cos(angle) * moveDistance;
        this.target.y = Math.sin(angle) * moveDistance;
    }

    setRandomTarget() {
        // Move randomly when idle
        const angle = Math.random() * 2 * Math.PI;
        const moveDistance = 80;
        this.target.x = Math.cos(angle) * moveDistance;
        this.target.y = Math.sin(angle) * moveDistance;
    }

    move(slowBase, gameWidth, gameHeight, initMassLog) {
        // Bots don't merge (single cell only)
        let cell = this.cells[0];
        cell.move(this.x, this.y, this.target, slowBase, initMassLog);
        gameLogic.adjustForBoundaries(cell, cell.radius/3, 0, gameWidth, gameHeight);
        
        this.x = cell.x;
        this.y = cell.y;
    }

    static checkForCollisions(botA, botB, botAIndex, botBIndex, callback) {
        if (!botA.cells[0] || !botB.cells[0]) return;
        
        let cellA = botA.cells[0];
        let cellB = botB.cells[0];

        let cellAData = { playerIndex: botAIndex, cellIndex: 0 };
        let cellBData = { playerIndex: botBIndex, cellIndex: 0 };

        let whoAteWho = Cell.checkWhoAteWho(cellA, cellB);

        if (whoAteWho == 1) {
            callback(cellBData, cellAData);
        } else if (whoAteWho == 2) {
            callback(cellAData, cellBData);
        }
    }
};

exports.BotManager = class {
    constructor() {
        this.data = [];
        this.nextBotNumber = 1;
    }

    spawnBot() {
        const botId = `bot_${this.nextBotNumber}`;
        const bot = new exports.Bot(botId, this.nextBotNumber);
        this.nextBotNumber++;
        
        const position = this.generateSpawnpoint();
        bot.init(position);
        
        this.data.push(bot);
        console.log(`[BOT] Bot${bot.botNumber} spawned at (${Math.round(position.x)}, ${Math.round(position.y)})`);
    }

    generateSpawnpoint() {
        const radius = util.massToRadius(config.bots.startMass.to);
        return {
            x: util.randomInRange(radius, config.gameWidth - radius),
            y: util.randomInRange(radius, config.gameHeight - radius)
        };
    }

    initializeBots() {
        for (let i = 0; i < config.bots.count; i++) {
            this.spawnBot();
        }
        console.log(`[BOT] Initialized ${config.bots.count} bots`);
    }

    respawnBot() {
        if (this.data.length < config.bots.count) {
            this.spawnBot();
        }
    }

    removeBotByIndex(index) {
        if (index >= 0 && index < this.data.length) {
            const bot = this.data[index];
            console.log(`[BOT] Bot${bot.botNumber} died`);
            this.data.splice(index, 1);
            setTimeout(() => this.respawnBot(), 2000);
        }
    }

    updateAI(players, food, viruses) {
        for (let bot of this.data) {
            bot.updateAI(players, this.data, food, viruses);
        }
    }

    shrinkCells(massLossRate, defaultPlayerMass, minMassLoss) {
        for (let bot of this.data) {
            bot.loseMassIfNeeded(massLossRate, defaultPlayerMass, minMassLoss);
        }
    }

    removeCell(botIndex, cellIndex) {
        return this.data[botIndex].removeCell(cellIndex);
    }

    getCell(botIndex, cellIndex) {
        return this.data[botIndex].cells[cellIndex];
    }

    handleCollisions(callback) {
        for (let botAIndex = 0; botAIndex < this.data.length; botAIndex++) {
            for (let botBIndex = botAIndex + 1; botBIndex < this.data.length; botBIndex++) {
                exports.Bot.checkForCollisions(
                    this.data[botAIndex],
                    this.data[botBIndex],
                    botAIndex,
                    botBIndex,
                    callback
                );
            }
        }
    }

    handlePlayerCollisions(players, callback) {
        for (let botIndex = 0; botIndex < this.data.length; botIndex++) {
            for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
                const bot = this.data[botIndex];
                const player = players[playerIndex];
                
                if (!bot.cells[0] || !player.cells) continue;
                
                for (let playerCellIndex = 0; playerCellIndex < player.cells.length; playerCellIndex++) {
                    const botCell = bot.cells[0];
                    const playerCell = player.cells[playerCellIndex];
                    
                    if (!botCell || !playerCell) continue;
                    
                    const whoAteWho = Cell.checkWhoAteWho(botCell, playerCell);
                    
                    if (whoAteWho == 1) {
                        callback(
                            { playerIndex, cellIndex: playerCellIndex, isPlayer: true },
                            { playerIndex: botIndex, cellIndex: 0, isPlayer: false }
                        );
                    } else if (whoAteWho == 2) {
                        callback(
                            { playerIndex: botIndex, cellIndex: 0, isPlayer: false },
                            { playerIndex, cellIndex: playerCellIndex, isPlayer: true }
                        );
                    }
                }
            }
        }
    }

    getTotalMass() {
        let result = 0;
        for (let bot of this.data) {
            result += bot.massTotal;
        }
        return result;
    }

    getBotsForLeaderboard() {
        return this.data.map(bot => ({
            id: bot.id,
            name: bot.name,
            massTotal: bot.massTotal
        }));
    }
};