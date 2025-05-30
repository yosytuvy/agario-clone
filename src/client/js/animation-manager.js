class AnimationManager {
    constructor() {
        this.animatedCells = new Map(); // cellId -> animation data
    }

    // Start animating a cell from oldRadius to newRadius
    startGrowthAnimation(cellId, oldRadius, newRadius) {
        const global = require('./global');
        
        const radiusDiff = Math.abs(newRadius - oldRadius);
        
        // Don't animate tiny changes or massive jumps
        if (radiusDiff < global.growthAnimation.minSizeChange || 
            radiusDiff > global.growthAnimation.maxSizeChange) {
            return newRadius;
        }

        // Store animation data
        this.animatedCells.set(cellId, {
            startRadius: oldRadius,
            targetRadius: newRadius,
            currentRadius: oldRadius,
            startTime: Date.now()
        });

        return oldRadius; // Return starting radius for immediate display
    }

    // Update all animations and return current display radius for a cell
    updateAndGetRadius(cellId, serverRadius) {
        const global = require('./global');
        
        if (!this.animatedCells.has(cellId)) {
            return serverRadius; // No animation for this cell
        }

        const anim = this.animatedCells.get(cellId);
        const progress = Math.min(1.0, global.growthAnimation.speed);

        // Lerp towards target
        anim.currentRadius += (anim.targetRadius - anim.currentRadius) * progress;

        // Check if animation is complete
        if (Math.abs(anim.currentRadius - anim.targetRadius) < 0.5) {
            this.animatedCells.delete(cellId); // Remove completed animation
            return serverRadius; // Use server radius
        }

        // If server radius changed during animation, update target
        if (Math.abs(serverRadius - anim.targetRadius) > 1) {
            anim.targetRadius = serverRadius;
        }

        return anim.currentRadius;
    }

    // Clean up animations for disconnected players
    cleanup() {
        // Remove animations older than 5 seconds
        const now = Date.now();
        for (let [cellId, anim] of this.animatedCells) {
            if (now - anim.startTime > 5000) {
                this.animatedCells.delete(cellId);
            }
        }
    }
}

module.exports = AnimationManager;