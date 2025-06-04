module.exports = {
    host: "0.0.0.0",
    port: 3000,
    logpath: "logger.php",
    foodMass: 1,
    fireFood: 20,
    limitSplit: 16,
    defaultPlayerMass: 10,
	virus: {
        fill: "#33ff33",
        stroke: "#19D119",
        strokeWidth: 20,
        defaultMass: {
            from: 100,
            to: 150
        },
        splitMass: 133,
        splitThreshold: 180,
        splitSpeed:22,
        uniformDisposition: true,
	},
    bots: {
        count: 20,
        detectionRange: 200,
        startMass: {
            from: 20,
            to: 200
        },
        maxMass: 1000,
        aiUpdateInterval: 3 // Update AI every 3 ticks for performance
    },
    gameWidth: 5000,
    gameHeight: 5000,
    adminPass: "DEFAULT",
    gameMass: 50000,
    maxFood: 3000,
    maxVirus: 50,
    slowBase: 4.5,
    logChat: 0,
    networkUpdateFactor: 40,
    maxHeartbeatInterval: 30000,
    foodUniformDisposition: true,
    newPlayerInitialPosition: "farthest",
    massLossRate: 1,
    minMassLoss: 50,
    sqlinfo: {
      fileName: "db.sqlite3",
    }
};
