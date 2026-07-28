# VBS STARFALL — Endless Action RPG v0.1

A complete playable vertical-slice prototype for a procedural 3D action RPG / shooter.

## Included

- touch-first spaceship controls
- keyboard controls
- third-person 3D camera
- procedural endless terrain chunks
- deterministic terrain generation from a seed
- enemy sentry AI
- auto-fire and manual fire
- missiles
- shields, hull, XP, levels, credits, score
- generated objectives: kill / recover relics / travel / reach sector
- evolving enemy tiers and elites
- ship upgrades
- pickups, particle sparks, explosions
- radar
- persistent local save
- checkpoint rebuild after death
- VBS Core Lens with Copy Report
- 256-bit NOR-backed VBS state mirror / 512 simulated NOR gates

## Architecture boundary

NOR remains the virtual state/control substrate for the VBS layer.
The 3D renderer, procedural terrain generation, physics, AI steering and game rules run in JavaScript/Three.js above it.

## Hosting

This page imports Three.js from jsDelivr and should be served from HTTPS.

## Prototype boundary

This is a substantial playable vertical slice, not a finished AAA commercial game.
The endless world is generated in chunks around the player and old chunks are discarded.
