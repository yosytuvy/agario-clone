"use strict";

const { isVisibleEntity } = require("../lib/entityUtils");

exports.foodUtils = require("./food");
exports.virusUtils = require("./virus");
exports.massFoodUtils = require("./massFood");
exports.playerUtils = require("./player");
exports.botUtils = require("./bot"); // Add bot utils

exports.Map = class {
    constructor(config) {
        this.food = new exports.foodUtils.FoodManager(
            config.foodMass,
            config.foodUniformDisposition
        );
        this.viruses = new exports.virusUtils.VirusManager(config.virus);
        this.massFood = new exports.massFoodUtils.MassFoodManager();
        this.players = new exports.playerUtils.PlayerManager();
        this.bots = new exports.botUtils.BotManager(); // Add bot manager
    }

    balanceMass(foodMass, gameMass, maxFood, maxVirus) {
        const totalMass =
            this.food.data.length * foodMass +
            this.players.getTotalMass() +
            this.bots.getTotalMass();

        const massDiff = gameMass - totalMass;
        const foodFreeCapacity = maxFood - this.food.data.length;
        const foodDiff = Math.min(
            parseInt(massDiff / foodMass),
            foodFreeCapacity
        );
        if (foodDiff > 0) {
            console.debug("[DEBUG] Adding " + foodDiff + " food");
            this.food.addNew(foodDiff);
        } else if (foodDiff && foodFreeCapacity !== maxFood) {
            console.debug("[DEBUG] Removing " + -foodDiff + " food");
            this.food.removeExcess(-foodDiff);
        }

        const virusesToAdd = maxVirus - this.viruses.data.length;
        if (virusesToAdd > 0) {
            this.viruses.addNew(virusesToAdd);
        }
    }

    enumerateWhatPlayersSee(callback) {
        // Include both players and bots in visibility
        const allEntities = [...this.players.data, ...this.bots.data];

        for (let currentPlayer of this.players.data) {
            var visibleFood = this.food.data.filter((entity) =>
                isVisibleEntity(entity, currentPlayer, false)
            );
            var visibleViruses = this.viruses.data.filter((entity) =>
                isVisibleEntity(entity, currentPlayer)
            );
            var visibleMass = this.massFood.data.filter((entity) =>
                isVisibleEntity(entity, currentPlayer)
            );

            const extractData = (entity) => {
                return {
                    x: entity.x,
                    y: entity.y,
                    cells: entity.cells,
                    massTotal: Math.round(entity.massTotal),
                    hue: entity.hue,
                    id: entity.id,
                    name: entity.name,
                };
            };

            var visibleEntities = [];
            for (let entity of allEntities) {
                for (let cell of entity.cells) {
                    if (isVisibleEntity(cell, currentPlayer)) {
                        visibleEntities.push(extractData(entity));
                        break;
                    }
                }
            }

            callback(
                extractData(currentPlayer),
                visibleEntities,
                visibleFood,
                visibleMass,
                visibleViruses
            );
        }
    }
};
