/**
 * physics.js — Cannon-ES physics integration
 *
 * Uses cannon-es (pure JS, no WASM required, CDN loaded once).
 * Physics world is ONLY active during Play mode.
 * On Play  → snapshot transforms, build bodies from inspector config
 * On Stop  → destroy world, RESTORE all transforms to editor positions
 */

// ── State ─────────────────────────────────────────────────────────────────────
let CANNON        = null;
let physicsWorld  = null;
let physicsBodies = {};        // objectId → CANNON.Body
let prePlaySnaps  = {};        // objectId → {px,py,pz,rx,ry,rz,sx,sy,sz,qx,qy,qz,qw}
let physicsReady  = false;
let physicsAccum  = 0;
const PHYS_STEP   = 1 / 60;
const PHYS_SUB    = 3;

// ── Default per-object config ─────────────────────────────────────────────────
function defaultPhysicsConfig() {
    return {
        enabled:       false,
        bodyType:      'dynamic',   // dynamic | static | kinematic
        mass:          1.0,
        restitution:   0.3,
        friction:      0.5,
        linearDamping: 0.05,
        angularDamping:0.1,
        gravityScale:  1.0,
        isTrigger:     false,
        shape:         'auto',      // auto | box | sphere | capsule | cylinder
    };
}

// ── Load Cannon-ES once ───────────────────────────────────────────────────────
function loadPhysicsLib() {
    return new Promise((resolve, reject) => {
        if (CANNON) { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';
        s.onload = () => {
            CANNON = window.CANNON;
            physicsReady = true;
            logConsole('✓ Cannon-ES physics loaded.', 'success');
            resolve();
        };
        s.onerror = () => {
            logConsole('✗ Cannon-ES failed to load. Physics disabled.', 'error');
            reject(new Error('Physics CDN failed'));
        };
        document.head.appendChild(s);
    });
}

// ── Snapshot transforms before play ──────────────────────────────────────────
function snapshotTransforms() {
    prePlaySnaps = {};
    engineObjects.forEach(e => {
        const o = e.object;
        const q = new THREE.Quaternion();
        o.getWorldQuaternion(q);
        prePlaySnaps[e.id] = {
            px:o.position.x, py:o.position.y, pz:o.position.z,
            rx:o.rotation.x, ry:o.rotation.y, rz:o.rotation.z,
            sx:o.scale.x, sy:o.scale.y, sz:o.scale.z,
            qx:q.x, qy:q.y, qz:q.z, qw:q.w
        };
    });
}

// ── Restore transforms after stop ────────────────────────────────────────────
function restoreTransforms() {
    engineObjects.forEach(e => {
        const s = prePlaySnaps[e.id];
        if (!s) return;
        e.object.position.set(s.px, s.py, s.pz);
        e.object.rotation.set(s.rx, s.ry, s.rz);
        e.object.scale.set(s.sx, s.sy, s.sz);
        if (e.object.userData.helper && e.object.userData.helper.update) {
            e.object.userData.helper.update();
        }
    });
    if (selectedObject) updateInspectorFromObject();
    logConsole('↺ Transforms restored to pre-play state.', 'info');
}

// ── Build CANNON shape from entry ─────────────────────────────────────────────
function buildCannonShape(entry) {
    const cfg   = entry.physics;
    const obj   = entry.object;
    const scale = new THREE.Vector3();
    obj.getWorldScale(scale);

    let shapeType = cfg.shape || 'auto';
    if (shapeType === 'auto') {
        const map = {
            Sphere:'sphere', Icosphere:'sphere',
            Cube:'box', Plane:'box', Ring:'box',
            Cylinder:'cylinder', Cone:'cylinder', Torus:'box'
        };
        shapeType = map[entry.type] || 'box';
    }

    const hx = Math.max(scale.x * 0.5, 0.01);
    const hy = Math.max(scale.y * 0.5, 0.01);
    const hz = Math.max(scale.z * 0.5, 0.01);
    const r  = Math.max(Math.max(hx, hy, hz), 0.01);

    switch (shapeType) {
        case 'sphere':   return new CANNON.Sphere(r);
        case 'cylinder': return new CANNON.Cylinder(hx, hx, hy * 2, 16);
        default:         return new CANNON.Box(new CANNON.Vec3(hx, hy, hz));
    }
}

// ── Create rigid body for an object ──────────────────────────────────────────
function createCannonBody(entry) {
    if (!CANNON || !physicsWorld) return null;
    const cfg = entry.physics;
    if (!cfg || !cfg.enabled) return null;

    const obj = entry.object;
    const wp  = new THREE.Vector3();
    const wq  = new THREE.Quaternion();
    obj.getWorldPosition(wp);
    obj.getWorldQuaternion(wq);

    const mass = cfg.bodyType === 'static' ? 0
               : cfg.bodyType === 'kinematic' ? 0
               : (cfg.mass || 1);

    const body = new CANNON.Body({
        mass,
        position: new CANNON.Vec3(wp.x, wp.y, wp.z),
        quaternion: new CANNON.Quaternion(wq.x, wq.y, wq.z, wq.w),
        linearDamping:  cfg.linearDamping  ?? 0.05,
        angularDamping: cfg.angularDamping ?? 0.1,
    });

    body.addShape(buildCannonShape(entry));

    if (cfg.bodyType === 'kinematic') body.type = CANNON.Body.KINEMATIC;
    if (cfg.isTrigger) body.collisionResponse = false;

    // Gravity scale via custom gravity
    if (cfg.gravityScale !== 1 && physicsWorld) {
        body.gravity = new CANNON.Vec3(
            physicsWorld.gravity.x * cfg.gravityScale,
            physicsWorld.gravity.y * cfg.gravityScale,
            physicsWorld.gravity.z * cfg.gravityScale
        );
        body.useGravity = true;
    }

    // Collision event for scripts
    body.addEventListener('collide', (e) => {
        const otherId = Object.keys(physicsBodies).find(k => physicsBodies[k] === e.body);
        const otherEntry = otherId ? engineObjects.find(o => o.id === otherId) : null;
        scriptEventBus.emit('onCollisionEnter', {
            other: otherEntry?.name || 'unknown',
            otherId: otherId || ''
        }, entry.id);
    });

    // Set material
    const mat = new CANNON.Material();
    mat.restitution = cfg.restitution ?? 0.3;
    mat.friction    = cfg.friction    ?? 0.5;
    body.material   = mat;

    physicsWorld.addBody(body);
    physicsBodies[entry.id] = body;
    return body;
}

// ── Start physics world ───────────────────────────────────────────────────────
async function startPhysics() {
    if (!physicsReady) {
        try { await loadPhysicsLib(); } catch(e) { return; }
    }

    snapshotTransforms();

    physicsWorld = new CANNON.World({
        gravity: new CANNON.Vec3(0, -9.82, 0)
    });
    physicsWorld.broadphase  = new CANNON.SAPBroadphase(physicsWorld);
    physicsWorld.allowSleep  = true;
    physicsWorld.defaultContactMaterial.restitution = 0.3;
    physicsWorld.defaultContactMaterial.friction    = 0.4;

    physicsBodies = {};
    physicsAccum  = 0;

    let count = 0;
    engineObjects.forEach(entry => {
        if (entry.physics?.enabled) {
            createCannonBody(entry);
            count++;
        }
    });

    logConsole(`⚙ Physics world started — ${count} bodies active.`, 'success');
}

// ── Stop physics & restore ────────────────────────────────────────────────────
function stopPhysics() {
    physicsBodies = {};
    physicsWorld  = null;
    restoreTransforms();
}

// ── Step physics — called from animate loop when isPlaying ────────────────────
function stepPhysics(dt) {
    if (!isPlaying || !physicsWorld || !physicsReady) return;
    physicsAccum += dt;
    while (physicsAccum >= PHYS_STEP) {
        physicsWorld.step(PHYS_STEP, PHYS_STEP, PHYS_SUB);
        physicsAccum -= PHYS_STEP;
    }

    // Sync Three.js positions from Cannon bodies
    Object.entries(physicsBodies).forEach(([id, body]) => {
        const entry = engineObjects.find(o => o.id === id);
        if (!entry) return;
        const { x,y,z }         = body.position;
        const { x:qx,y:qy,z:qz,w:qw } = body.quaternion;
        entry.object.position.set(x, y, z);
        entry.object.quaternion.set(qx, qy, qz, qw);
        if (entry.object.userData.helper?.update) entry.object.userData.helper.update();
    });
}

// ── Physics Script API ────────────────────────────────────────────────────────
function buildPhysicsAPI(entry) {
    const getBody = () => physicsBodies[entry.id] || null;
    return {
        get enabled() { return !!(entry.physics?.enabled); },
        get bodyType() { return entry.physics?.bodyType || 'none'; },

        applyForce(x, y, z, wx=0, wy=0, wz=0) {
            const b = getBody();
            if (b) b.applyForce(new CANNON.Vec3(x,y,z), new CANNON.Vec3(wx,wy,wz));
        },
        applyImpulse(x, y, z, wx=0, wy=0, wz=0) {
            const b = getBody();
            if (b) b.applyImpulse(new CANNON.Vec3(x,y,z), new CANNON.Vec3(wx,wy,wz));
        },
        applyTorque(x, y, z) {
            const b = getBody();
            if (b) b.torque.set(b.torque.x+x, b.torque.y+y, b.torque.z+z);
        },
        setVelocity(x, y, z) {
            const b = getBody();
            if (b) b.velocity.set(x,y,z);
        },
        getVelocity() {
            const b = getBody();
            return b ? {x:b.velocity.x, y:b.velocity.y, z:b.velocity.z} : {x:0,y:0,z:0};
        },
        setAngularVelocity(x, y, z) {
            const b = getBody();
            if (b) b.angularVelocity.set(x,y,z);
        },
        setGravityScale(s) {
            if (entry.physics) entry.physics.gravityScale = s;
            const b = getBody();
            if (b && physicsWorld) {
                b.gravity = new CANNON.Vec3(0, physicsWorld.gravity.y * s, 0);
            }
        },
        get isSleeping() { return getBody()?.sleepState === CANNON.Body.SLEEPING; },
        wakeUp() { getBody()?.wakeUp(); },
        sleep()  { getBody()?.sleep();  },
        onCollision(fn) {
            if (typeof scriptEventBus === 'undefined') return;
            scriptEventBus.on('onCollisionEnter', (data, senderId) => {
                if (senderId === entry.id) fn(data.other, data.otherId, true);
            }, entry.id + '_phys');
        },
        setPosition(x,y,z) {
            const b = getBody();
            if (b) { b.position.set(x,y,z); b.velocity.set(0,0,0); }
        },
    };
}
