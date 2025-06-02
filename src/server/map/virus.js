"use strict";

const util = require("../lib/util");
const { v4: uuidv4 } = require("uuid");
const { getPosition } = require("../lib/entityUtils");
const gameLogic = require("../game-logic");
const config = require("../../../config")
const sat = require("sat");

class Virus {
    constructor(position, radius, mass, config) {
        this.id = uuidv4();
        this.x = position.x;
        this.y = position.y;
        this.radius = radius;
        this.mass = mass;
        this.fill = config.fill;
        this.stroke = config.stroke;
        this.strokeWidth = config.strokeWidth;
        this.speed = 0;
        this.direction = new sat.Vector(0, 0);
    }

    addMass(mass) {
        this.mass += mass;
        this.radius = util.massToRadius(this.mass);
    }

    move(gameWidth, gameHeight) {
        if (this.speed <= 0) return;

        var deltaX = this.speed * this.direction.x;
        var deltaY = this.speed * this.direction.y;

        this.speed -= 0.5; // Deceleration
        if (this.speed < 0) {
            this.speed = 0;
        }

        if (!isNaN(deltaY)) {
            this.y += deltaY;
        }
        if (!isNaN(deltaX)) {
            this.x += deltaX;
        }

        gameLogic.adjustForBoundaries(
            this,
            this.radius,
            5,
            gameWidth,
            gameHeight
        );
    }

    setSplitVelocity(direction, speed = 15) {
        this.direction = direction.clone().normalize();
        this.speed = speed;
    }
}

exports.VirusManager = class {
    constructor(virusConfig) {
        this.data = [];
        this.virusConfig = virusConfig;
    }

    pushNew(virus) {
        this.data.push(virus);
    }

    addNew(number) {
        while (number--) {
            var mass = util.randomInRange(
                this.virusConfig.defaultMass.from,
                this.virusConfig.defaultMass.to
            );
            var radius = util.massToRadius(mass);
            var position = getPosition(
                this.virusConfig.uniformDisposition,
                radius,
                this.data
            );
            var newVirus = new Virus(position, radius, mass, this.virusConfig);
            this.pushNew(newVirus);
        }
    }

    delete(virusCollision) {
        this.data.splice(virusCollision, 1);
    }

    move(gameWidth, gameHeight) {
        for (let virus of this.data) {
            virus.move(gameWidth, gameHeight);
        }
    }

    splitVirus(virusIndex, massFoodDirection) {
        const virus = this.data[virusIndex];

        const newMass = this.virusConfig.defaultMass.from;
        const newRadius = util.massToRadius(newMass);

        const splitDirection = new sat.Vector(
            massFoodDirection.x,
            massFoodDirection.y
        ).normalize();

        const newVirus = new Virus(
            { x: virus.x, y: virus.y },
            newRadius,
            newMass,
            this.virusConfig
        );

        virus.mass = newMass;
        virus.radius = newRadius;

        newVirus.setSplitVelocity(splitDirection, config.virus.splitSpeed);

        this.pushNew(newVirus);
    }

    feedVirus(virusIndex, mass, massFoodDirection) {
        this.data[virusIndex].addMass(mass);

        if (this.data[virusIndex].mass >= this.virusConfig.splitThreshold) {
            this.splitVirus(virusIndex, massFoodDirection);
        }
    }
};
