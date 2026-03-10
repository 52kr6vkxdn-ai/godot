/**
 * script-engine.js
 * – Each object has its own `entry.script` string (saved with scene)
 * – Scripts compile & run ONLY during Play mode
 * – Script Library: global store of named scripts loadable into any object
 * – Camera API with main-camera switching
 * – Physics API (Cannon-ES) + PostFX API exposed to scripts
 */

// ── Play state ────────────────────────────────────────────────────────────────
let isPlaying       = false;
let isPaused        = false;
let scriptInstances = {};     // objectId → { lifecycle, api }
let lastFrameTime   = performance.now();
let playStartTime   = 0;

// ── Script Library (shared scripts) ──────────────────────────────────────────
// { id, name, code, description, tags[] }
let scriptLibrary = JSON.parse(localStorage.getItem('forge3d_scriptlib') || '[]');

function saveScriptLibrary() {
    try { localStorage.setItem('forge3d_scriptlib', JSON.stringify(scriptLibrary)); } catch(e) {}
}

function addToScriptLibrary(name, code, description = '') {
    const existing = scriptLibrary.find(s => s.name === name);
    if (existing) { existing.code = code; existing.description = description; }
    else scriptLibrary.push({ id: THREE.MathUtils.generateUUID(), name, code, description, tags: [] });
    saveScriptLibrary();
    logConsole(`Script "${name}" saved to library.`, 'success');
    renderScriptLibraryUI();
}

function loadScriptFromLibrary(libId, entry) {
    const lib = scriptLibrary.find(s => s.id === libId);
    if (!lib || !entry) return;
    entry.script = lib.code;
    logConsole(`Script "${lib.name}" loaded into "${entry.name}".`, 'success');
    if (selectedObject && selectedObject.id === entry.id) buildDynamicInspector(entry);
    updateHierarchyUI();
}

function deleteFromScriptLibrary(libId) {
    scriptLibrary = scriptLibrary.filter(s => s.id !== libId);
    saveScriptLibrary();
    renderScriptLibraryUI();
}

function renderScriptLibraryUI() {
    const list = document.getElementById('script-lib-list');
    if (!list) return;
    if (scriptLibrary.length === 0) {
        list.innerHTML = '<div style="color:var(--text-inactive);font-size:11px;padding:8px;">No scripts in library. Save a script to share it.</div>';
        return;
    }
    list.innerHTML = scriptLibrary.map(s => `
        <div class="lib-item">
            <div class="lib-item-name"><i class="fas fa-code" style="color:var(--accent-color);margin-right:6px;"></i>${s.name}</div>
            ${s.description ? `<div class="lib-item-desc">${s.description}</div>` : ''}
            <div class="lib-item-actions">
                <button onclick="loadScriptIntoSelected('${s.id}')" class="lib-btn lib-btn-load" title="Load into selected object"><i class="fas fa-download"></i> Load</button>
                <button onclick="openLibScriptPreview('${s.id}')" class="lib-btn" title="Preview code"><i class="fas fa-eye"></i></button>
                <button onclick="deleteFromScriptLibrary('${s.id}')" class="lib-btn lib-btn-del" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('');
}

function loadScriptIntoSelected(libId) {
    if (!selectedObject) { logConsole('No object selected.', 'warn'); return; }
    loadScriptFromLibrary(libId, selectedObject);
}

function openLibScriptPreview(libId) {
    const lib = scriptLibrary.find(s => s.id === libId);
    if (!lib) return;
    // Open script editor in read-only preview mode
    openScriptEditor(null, lib.code, lib.name);
}

// ── Input State ───────────────────────────────────────────────────────────────
const scriptInputState = {
    keys: {}, keysPressed: {}, mouseButtons: {},
    mouse: { x:0, y:0, nx:0, ny:0 }
};

function initScriptInput() {
    document.addEventListener('keydown', e => {
        const k = e.key.toLowerCase();
        if (!scriptInputState.keys[k]) scriptInputState.keysPressed[k] = true;
        scriptInputState.keys[k] = true;
    });
    document.addEventListener('keyup', e => {
        scriptInputState.keys[e.key.toLowerCase()] = false;
    });
    renderer.domElement.addEventListener('mousemove', e => {
        const rect = renderer.domElement.getBoundingClientRect();
        scriptInputState.mouse.x  = e.clientX - rect.left;
        scriptInputState.mouse.y  = e.clientY - rect.top;
        scriptInputState.mouse.nx = (scriptInputState.mouse.x / rect.width)  * 2 - 1;
        scriptInputState.mouse.ny = (scriptInputState.mouse.y / rect.height) * 2 - 1;
    });
    renderer.domElement.addEventListener('mousedown', e => { scriptInputState.mouseButtons[e.button] = true; });
    renderer.domElement.addEventListener('mouseup',   e => { scriptInputState.mouseButtons[e.button] = false; });
}

// ── Event Bus ─────────────────────────────────────────────────────────────────
const scriptEventBus = {
    listeners: {},
    on(name, fn, ownerId) {
        if (!this.listeners[name]) this.listeners[name] = [];
        this.listeners[name].push({ fn, ownerId });
    },
    emit(name, data, senderId) {
        (this.listeners[name]||[]).forEach(l => { try { l.fn(data, senderId); } catch(e) {} });
    },
    clearOwner(ownerId) {
        Object.keys(this.listeners).forEach(n => {
            this.listeners[n] = this.listeners[n].filter(l => l.ownerId !== ownerId);
        });
    }
};

// ── Build API for one object ──────────────────────────────────────────────────
function buildScriptAPI(entry) {
    const obj3d = entry.object;

    // Transform
    const transform = {
        get position() { return {x:obj3d.position.x, y:obj3d.position.y, z:obj3d.position.z}; },
        set position(v) { obj3d.position.set(v.x??obj3d.position.x, v.y??obj3d.position.y, v.z??obj3d.position.z); },
        setPosition(x,y,z) { obj3d.position.set(x,y,z); },
        translate(x,y,z) { obj3d.position.x+=x; obj3d.position.y+=y; obj3d.position.z+=z; },
        get rotation() { return {x:THREE.MathUtils.radToDeg(obj3d.rotation.x), y:THREE.MathUtils.radToDeg(obj3d.rotation.y), z:THREE.MathUtils.radToDeg(obj3d.rotation.z)}; },
        setRotation(x,y,z) { obj3d.rotation.set(THREE.MathUtils.degToRad(x), THREE.MathUtils.degToRad(y), THREE.MathUtils.degToRad(z)); },
        rotate(x,y,z) { obj3d.rotation.x+=THREE.MathUtils.degToRad(x); obj3d.rotation.y+=THREE.MathUtils.degToRad(y); obj3d.rotation.z+=THREE.MathUtils.degToRad(z); },
        get scale() { return {x:obj3d.scale.x, y:obj3d.scale.y, z:obj3d.scale.z}; },
        setScale(x,y,z) { obj3d.scale.set(x,y,z); },
        lookAt(x,y,z) { obj3d.lookAt(x,y,z); },
        getWorldPosition() { const v=new THREE.Vector3(); obj3d.getWorldPosition(v); return {x:v.x,y:v.y,z:v.z}; },
        getForward() { const v=new THREE.Vector3(0,0,-1).applyQuaternion(obj3d.quaternion); return {x:v.x,y:v.y,z:v.z}; },
        getRight()   { const v=new THREE.Vector3(1,0,0).applyQuaternion(obj3d.quaternion); return {x:v.x,y:v.y,z:v.z}; },
    };

    // Material
    const material = obj3d.isMesh ? {
        get color() { return '#'+obj3d.material.color.getHexString(); },
        set color(v) { obj3d.material.color.set(v); },
        setColor(hex) { obj3d.material.color.set(hex); },
        get roughness() { return obj3d.material.roughness; },
        set roughness(v) { obj3d.material.roughness=v; },
        get metalness() { return obj3d.material.metalness; },
        set metalness(v) { obj3d.material.metalness=v; },
        get opacity() { return obj3d.material.opacity; },
        set opacity(v) { obj3d.material.transparent=v<1; obj3d.material.opacity=v; },
        get wireframe() { return obj3d.material.wireframe; },
        set wireframe(v) { obj3d.material.wireframe=v; },
        setEmissive(hex,i=1) { obj3d.material.emissive=new THREE.Color(hex); obj3d.material.emissiveIntensity=i; },
        get emissiveColor() { return '#'+obj3d.material.emissive?.getHexString(); },
    } : null;

    // Light
    const lightAPI = obj3d.isLight ? {
        get color() { return '#'+obj3d.color.getHexString(); },
        set color(v) { obj3d.color.set(v); },
        get intensity() { return obj3d.intensity; },
        set intensity(v) { obj3d.intensity=v; },
        pulse(speed=1,min=0.2,max=1.5) { obj3d.intensity=min+(Math.sin(performance.now()/1000*speed)*0.5+0.5)*(max-min); },
        flicker(speed=8, chaos=0.4) {
            obj3d.intensity = Math.max(0, 1 + (Math.random()-0.5)*chaos + Math.sin(performance.now()*0.001*speed)*0.1);
        },
        get shadowEnabled() { return obj3d.castShadow; },
        set shadowEnabled(v) { obj3d.castShadow=v; },
    } : null;

    // Scene API
    const sceneAPI = {
        find(name) { const e=engineObjects.find(o=>o.name===name); return e?buildScriptAPI(e):null; },
        findById(id) { const e=engineObjects.find(o=>o.id===id); return e?buildScriptAPI(e):null; },
        findByTag(tag) { return engineObjects.filter(o=>o.tags?.includes(tag)).map(o=>buildScriptAPI(o)); },
        getAllObjects() { return engineObjects.map(o=>({name:o.name,id:o.id,type:o.type})); },
        get backgroundColor() { return '#'+scene.background?.getHexString(); },
        set backgroundColor(hex) { scene.background=new THREE.Color(hex); },
        setFog(color,near,far) { scene.fog=new THREE.Fog(color,near,far); },
        removeFog() { scene.fog=null; },
        instantiate(type, name, x=0, y=0, z=0) {
            const e = createEngineObject(name||type, type, false);
            e.object.position.set(x,y,z);
            return buildScriptAPI(e);
        },
    };

    // Input API
    const inputAPI = {
        isKeyDown(k) { return !!scriptInputState.keys[k.toLowerCase()]; },
        isKeyPressed(k) { return !!scriptInputState.keysPressed[k.toLowerCase()]; },
        getMousePosition() { return {...scriptInputState.mouse}; },
        isMouseDown(btn=0) { return !!scriptInputState.mouseButtons[btn]; },
    };

    // Camera API — controls MAIN editor camera or switches main camera
    const cameraAPI = {
        get position() { return {x:camera.position.x, y:camera.position.y, z:camera.position.z}; },
        setPosition(x,y,z) { camera.position.set(x,y,z); },
        lookAt(x,y,z) { camera.lookAt(x,y,z); orbitControls.target.set(x,y,z); },
        get fov() { return camera.fov; },
        set fov(v) { camera.fov=v; camera.updateProjectionMatrix(); },
        shake(intensity=0.2, duration=300) {
            const start=performance.now(), orig=camera.position.clone();
            const tick=()=>{ const el=performance.now()-start;
                if(el>duration){camera.position.copy(orig);return;}
                camera.position.x=orig.x+(Math.random()-0.5)*intensity;
                camera.position.y=orig.y+(Math.random()-0.5)*intensity;
                requestAnimationFrame(tick);};
            requestAnimationFrame(tick);
        },
        // Switch main camera to a named scene camera
        setMainCamera(name) {
            const e = engineObjects.find(o => o.name===name && o.type==='Camera');
            if (e) setMainCamera(e.id);
        },
        getMainCameraName() {
            const e = engineObjects.find(o => o.id===mainCameraId);
            return e ? e.name : null;
        },
        // Get the currently active render camera object
        getActive() {
            return getActiveRenderCamera();
        },
        get exposure() { return renderer.toneMappingExposure; },
        set exposure(v) { renderer.toneMappingExposure=v; },
    };

    // Time API
    const timeAPI = {
        get now() { return (performance.now()-playStartTime)/1000; },
        get fps() { return currentFps; },
        get dt()  { return Math.min((performance.now()-lastFrameTime)/1000, 0.1); },
        sin(speed=1) { return Math.sin(this.now*speed); },
        cos(speed=1) { return Math.cos(this.now*speed); },
        pingPong(speed=1) { return Math.abs(Math.sin(this.now*speed)); },
    };

    // Math API
    const mathAPI = {
        lerp:(a,b,t)=>a+(b-a)*t,
        clamp:(v,min,max)=>Math.min(max,Math.max(min,v)),
        map:(v,a,b,c,d)=>c+((v-a)/(b-a))*(d-c),
        random:(min=0,max=1)=>min+Math.random()*(max-min),
        randomInt:(min,max)=>Math.floor(min+Math.random()*(max-min+1)),
        sin:Math.sin, cos:Math.cos, abs:Math.abs, PI:Math.PI, sqrt:Math.sqrt,
        deg:r=>THREE.MathUtils.radToDeg(r),
        rad:d=>THREE.MathUtils.degToRad(d),
        distance:(a,b)=>Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2+(a.z-b.z)**2),
        normalize(v) { const l=Math.sqrt(v.x*v.x+v.y*v.y+v.z*v.z)||1; return {x:v.x/l,y:v.y/l,z:v.z/l}; },
    };

    // Debug API
    const debugAPI = {
        log:(m)=>logConsole(`[${entry.name}] ${m}`,'info'),
        warn:(m)=>logConsole(`[${entry.name}] ⚠ ${m}`,'warn'),
        error:(m)=>logConsole(`[${entry.name}] ✖ ${m}`,'error'),
    };

    // Audio API
    const audioAPI = {
        playTone(freq=440, dur=0.2, type='sine') {
            try {
                const ctx=new(window.AudioContext||window.webkitAudioContext)();
                const osc=ctx.createOscillator(), gain=ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type=type; osc.frequency.value=freq;
                gain.gain.setValueAtTime(0.3,ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);
                osc.start(); osc.stop(ctx.currentTime+dur);
            } catch(e) {}
        }
    };

    // Events API
    const eventsAPI = {
        emit(name,data) { scriptEventBus.emit(name,data,entry.id); },
        on(name,fn) { scriptEventBus.on(name,fn,entry.id); },
    };

    // Self API
    const selfAPI = {
        get name() { return entry.name; },
        set name(v) { entry.name=v; obj3d.name=v; updateHierarchyUI(); },
        get id()   { return entry.id; },
        get type() { return entry.type; },
        get active() { return obj3d.visible; },
        set active(v) { obj3d.visible=v; },
        setActive(v) { obj3d.visible=v; },
        destroy() { const e=entry; selectObject(e); deleteSelected(); },
        clone()   { const s=selectedObject; selectObject(entry); duplicateSelected(); selectObject(s); },
        get tags() { return entry.tags||[]; },
        addTag(t) { entry.tags=entry.tags||[]; if(!entry.tags.includes(t)) entry.tags.push(t); },
        removeTag(t) { entry.tags=(entry.tags||[]).filter(x=>x!==t); },
        hasTag(t) { return (entry.tags||[]).includes(t); },
        data: entry.scriptData||(entry.scriptData={}),
        getChild(name) {
            const cid = entry.children?.find(id => engineObjects.find(o=>o.id===id&&o.name===name));
            const ce = engineObjects.find(o=>o.id===cid);
            return ce ? buildScriptAPI(ce) : null;
        },
        getChildren() {
            return (entry.children||[]).map(id=>{const e=engineObjects.find(o=>o.id===id);return e?buildScriptAPI(e):null;}).filter(Boolean);
        },
    };

    // Physics API
    const physicsAPI = (typeof buildPhysicsAPI === 'function') ? buildPhysicsAPI(entry) : null;

    // PostFX API
    const postfxAPI = (typeof buildPostFXScriptAPI === 'function') ? buildPostFXScriptAPI() : null;

    return {
        self: selfAPI, transform, material, light: lightAPI,
        scene: sceneAPI, input: inputAPI, camera: cameraAPI,
        time: timeAPI, debug: debugAPI, audio: audioAPI,
        events: eventsAPI, math: mathAPI,
        physics: physicsAPI, postfx: postfxAPI,
        THREE,
    };
}

// ── Compile a single script ───────────────────────────────────────────────────
function compileScript(entry) {
    if (!entry.script?.trim()) return null;
    const api    = buildScriptAPI(entry);
    const keys   = Object.keys(api);
    const vals   = keys.map(k => api[k]);
    try {
        const src = `"use strict";
let _start=null,_update=null;
function start(fn){_start=fn;}
function update(fn){_update=fn;}
${entry.script}
return {start:_start,update:_update};`;
        const factory   = new Function(...keys, src);
        const lifecycle = factory(...vals);
        return { lifecycle, api, error: null };
    } catch(err) {
        logConsole(`[${entry.name}] Compile error: ${err.message}`, 'error');
        return { lifecycle: null, api, error: err.message };
    }
}

// ── Play / Stop / Pause ───────────────────────────────────────────────────────
async function playScene() {
    if (isPlaying) return;

    // Start physics first (async — loads Cannon-ES if needed)
    if (typeof startPhysics === 'function') await startPhysics();

    isPlaying = true; isPaused = false;
    playStartTime = lastFrameTime = performance.now();
    scriptInstances = {};

    // ── Switch viewport to game camera ─────────────────────────────────────────
    // 1. Detach transform controls so gizmo disappears in play
    if (typeof transformControls !== 'undefined') transformControls.detach();
    // 2. Disable orbit so mouse is free for game input
    if (typeof orbitControls !== 'undefined') orbitControls.enabled = false;
    // 3. Hide grid and helpers
    if (typeof gridHelper !== 'undefined') gridHelper.visible = false;
    engineObjects.forEach(o => {
        if (o.object.userData.helper) o.object.userData.helper.visible = false;
    });
    // 4. Update the composer's render pass to use the game camera right away
    if (typeof renderPass !== 'undefined' && renderPass) {
        const gameCam = getActiveRenderCamera();
        renderPass.camera = gameCam;
    }

    // ── Compile & start all object scripts ─────────────────────────────────────
    let compiled = 0;
    engineObjects.forEach(entry => {
        if (!entry.script?.trim()) return;
        const c = compileScript(entry);
        if (!c?.lifecycle) return;
        scriptInstances[entry.id] = c;
        compiled++;
        try { if (c.lifecycle.start) c.lifecycle.start(); } catch(err) {
            logConsole(`[${entry.name}] start() error: ${err.message}`, 'error');
        }
    });

    const mainEntry = engineObjects.find(o => o.id === mainCameraId);
    const camName   = mainEntry ? mainEntry.name : 'Editor Camera';
    logConsole(`▶ Playing — game camera: "${camName}" — ${compiled} scripts running.`, 'success');
    updatePlayButtons();
    document.getElementById('viewport-wrapper')?.classList.add('playing');
}

function stopScene() {
    if (!isPlaying) return;
    isPlaying = false; isPaused = false;
    scriptInstances = {};
    scriptEventBus.listeners = {};
    scriptInputState.keysPressed = {};

    // ── Restore editor camera & helpers ────────────────────────────────────────
    if (typeof orbitControls !== 'undefined') orbitControls.enabled = true;
    if (typeof gridHelper    !== 'undefined') gridHelper.visible = true;
    engineObjects.forEach(o => {
        if (o.object.userData.helper) o.object.userData.helper.visible = true;
    });
    // Re-attach transform gizmo to previously selected object
    if (typeof selectedObject !== 'undefined' && selectedObject && typeof transformControls !== 'undefined') {
        transformControls.attach(selectedObject.object);
    }
    // Restore composer to use editor camera
    if (typeof renderPass !== 'undefined' && renderPass) {
        renderPass.camera = camera;
    }

    if (typeof stopPhysics === 'function') stopPhysics();
    logConsole('⏹ Scene stopped — editor camera restored.', 'info');
    updatePlayButtons();
    document.getElementById('viewport-wrapper')?.classList.remove('playing');
}

function pauseScene() {
    if (!isPlaying) return;
    isPaused = !isPaused;
    // In pause mode re-enable orbit so dev can inspect the frozen scene
    if (typeof orbitControls !== 'undefined') orbitControls.enabled = isPaused;
    logConsole(isPaused ? '⏸ Paused — orbit re-enabled for inspection.' : '▶ Resumed.', 'info');
    updatePlayButtons();
}

// ── Tick scripts every frame ──────────────────────────────────────────────────
function tickScripts() {
    if (!isPlaying || isPaused) return;
    const now = performance.now();
    const dt  = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;

    Object.entries(scriptInstances).forEach(([id, inst]) => {
        if (!inst.lifecycle?.update) return;
        const entry = engineObjects.find(o => o.id === id);
        if (!entry || !entry.object.visible) return;
        try { inst.lifecycle.update(dt); } catch(err) {
            logConsole(`[${entry.name}] update() error: ${err.message}`, 'error');
            delete scriptInstances[id];
        }
    });
    scriptInputState.keysPressed = {};
}

// ── Play button state ─────────────────────────────────────────────────────────
function updatePlayButtons() {
    const play  = document.getElementById('btn-play');
    const pause = document.getElementById('btn-pause');
    const stop  = document.getElementById('btn-stop');
    const ind   = document.getElementById('play-indicator');
    const mode  = document.getElementById('stat-mode');

    if (play)  play.classList.toggle('active', isPlaying && !isPaused);
    if (pause) pause.classList.toggle('active', isPaused);
    if (stop)  stop.classList.toggle('active', false);
    if (ind)   ind.classList.toggle('hidden', !isPlaying);
    if (mode)  mode.innerText = isPlaying ? (isPaused ? '⏸ PAUSED' : '▶ PLAYING') : (quadMode ? 'Quad View' : 'Perspective');
}
