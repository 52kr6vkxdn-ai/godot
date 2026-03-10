/**
 * script-editor.js
 * Fullscreen script editor with CodeMirror 5 syntax highlighting,
 * per-object scripts, script library (save/load), live error bar,
 * API reference sidebar, snippet insertion.
 */

let scriptEditorTarget = null;
let scriptEditorDirty  = false;
let cmEditor           = null;   // CodeMirror instance
let cmReadOnly         = false;

// ── Load CodeMirror 5 from CDN ────────────────────────────────────────────────
async function loadCodeMirror() {
    if (window.CodeMirror) return;
    const BASE = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/';
    const load = (url, type='script') => new Promise((res, rej) => {
        if (type === 'style') {
            if (document.querySelector(`link[href="${url}"]`)) { res(); return; }
            const l = document.createElement('link');
            l.rel = 'stylesheet'; l.href = url;
            l.onload = res; l.onerror = rej;
            document.head.appendChild(l);
        } else {
            if (document.querySelector(`script[src="${url}"]`)) { res(); return; }
            const s = document.createElement('script');
            s.src = url; s.onload = res; s.onerror = rej;
            document.head.appendChild(s);
        }
    });
    await load(BASE + 'codemirror.min.css', 'style');
    await load(BASE + 'theme/dracula.min.css', 'style');
    await load(BASE + 'codemirror.min.js');
    await load(BASE + 'mode/javascript/javascript.min.js');
    await load(BASE + 'addon/edit/matchbrackets.min.js');
    await load(BASE + 'addon/edit/closebrackets.min.js');
    await load(BASE + 'addon/lint/lint.min.js');
    await load(BASE + 'addon/lint/lint.min.css', 'style');
    await load(BASE + 'addon/comment/comment.min.js');
    await load(BASE + 'addon/hint/show-hint.min.js');
    await load(BASE + 'addon/hint/show-hint.min.css', 'style');
    await load(BASE + 'addon/hint/javascript-hint.min.js');
}

// ── Open editor ───────────────────────────────────────────────────────────────
async function openScriptEditor(entry, previewCode, previewTitle) {
    cmReadOnly  = !entry;
    scriptEditorTarget = entry || null;
    scriptEditorDirty  = false;

    const overlay  = document.getElementById('script-editor-overlay');
    const title    = document.getElementById('script-editor-title');
    const errBar   = document.getElementById('script-error-bar');

    title.innerText = previewTitle ? `📖 ${previewTitle}` : (entry ? `⚡ ${entry.name} — Script` : 'Script Editor');
    if (errBar) errBar.classList.add('hidden');
    overlay.classList.add('active');

    const code = previewCode ?? (entry?.script || getDefaultScript(entry?.type || 'Empty'));

    await loadCodeMirror();

    const holder = document.getElementById('cm-editor-holder');
    holder.innerHTML = '';

    cmEditor = CodeMirror(holder, {
        value: code,
        mode: 'javascript',
        theme: 'dracula',
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        indentUnit: 2,
        tabSize: 2,
        indentWithTabs: false,
        extraKeys: {
            'Ctrl-S': () => closeScriptEditor(true),
            'Cmd-S':  () => closeScriptEditor(true),
            'Tab': cm => cm.execCommand('indentMore'),
            'Shift-Tab': cm => cm.execCommand('indentLess'),
            'Ctrl-/': cm => cm.execCommand('toggleComment'),
            'Ctrl-Space': 'autocomplete',
        },
        readOnly: cmReadOnly ? 'nocursor' : false,
        gutters: ['CodeMirror-lint-markers'],
        lineWrapping: false,
        scrollbarStyle: 'overlay',
    });

    cmEditor.setSize('100%', '100%');

    // Live error detection
    if (!cmReadOnly) {
        cmEditor.on('change', () => {
            scriptEditorDirty = true;
            lintCM();
        });
    }

    // Show/hide Save/SaveToLib buttons
    document.getElementById('btn-script-save')?.classList.toggle('hidden', cmReadOnly);
    document.getElementById('btn-script-savelibsec')?.classList.toggle('hidden', cmReadOnly);

    setTimeout(() => cmEditor.refresh(), 50);
    lintCM();
    buildAPIReference();
    renderSnippets();
}

function closeScriptEditor(save = true) {
    if (save && !cmReadOnly && scriptEditorTarget && cmEditor) {
        const code = cmEditor.getValue();
        scriptEditorTarget.script = code;
        logConsole(`Script saved → "${scriptEditorTarget.name}".`, 'success');
        // Hot-reload if playing
        if (isPlaying && code.trim()) {
            const c = compileScript(scriptEditorTarget);
            if (c?.lifecycle) {
                scriptInstances[scriptEditorTarget.id] = c;
                try { if (c.lifecycle.start) c.lifecycle.start(); } catch(e){}
            }
        }
        recordHistory(`Edit script: ${scriptEditorTarget.name}`);
        updateHierarchyUI();
        if (selectedObject?.id === scriptEditorTarget.id) buildDynamicInspector(scriptEditorTarget);
    }
    document.getElementById('script-editor-overlay').classList.remove('active');
    scriptEditorTarget = null;
}

// ── Load .js file into the editor ─────────────────────────────────────────────
function loadScriptFromFile(file) {
    if (!file || cmReadOnly) return;
    if (!file.name.endsWith('.js') && file.type !== 'text/javascript' && file.type !== 'application/javascript') {
        logConsole('Please choose a .js file.', 'warn');
        return;
    }
    const reader = new FileReader();
    reader.onload = e => {
        const code = e.target.result;
        if (cmEditor) {
            cmEditor.setValue(code);
            cmEditor.clearHistory();      // don't let Ctrl+Z undo the file load
            lintCM();
            logConsole(`Loaded "${file.name}" into script editor.`, 'success');
        }
    };
    reader.onerror = () => logConsole('File read failed.', 'error');
    reader.readAsText(file);
    // Reset file input so the same file can be loaded again
    const inp = document.getElementById('se-load-file-input');
    if (inp) inp.value = '';
}

// ── Save / export current editor content as a .js file ───────────────────────
function saveScriptAsFile() {
    if (!cmEditor) return;
    const code     = cmEditor.getValue();
    const fileName = scriptEditorTarget
        ? `${scriptEditorTarget.name.replace(/[^a-zA-Z0-9_-]/g,'_')}.js`
        : 'script.js';
    const blob = new Blob([code], { type: 'text/javascript' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
    logConsole(`Script exported as "${fileName}".`, 'success');
}

function saveScriptToLibraryPrompt() {
    if (!cmEditor) return;
    const name = prompt('Library script name:', scriptEditorTarget?.name || 'My Script');
    if (!name) return;
    const desc = prompt('Short description (optional):') || '';
    addToScriptLibrary(name, cmEditor.getValue(), desc);
}

// ── Lint ──────────────────────────────────────────────────────────────────────
function lintCM() {
    if (!cmEditor || cmReadOnly) return;
    const code = cmEditor.getValue();
    const errBar = document.getElementById('script-error-bar');
    try {
        new Function(code);
        if (errBar) { errBar.classList.add('hidden'); errBar.innerText = ''; }
    } catch(err) {
        if (errBar) { errBar.classList.remove('hidden'); errBar.innerText = `⚠ ${err.message}`; }
    }
}

// ── Snippet insertion ─────────────────────────────────────────────────────────
function insertSnippet(code) {
    if (!cmEditor || cmReadOnly) return;
    const doc = cmEditor.getDoc();
    const cur = doc.getCursor();
    doc.replaceRange(code + '\n', cur);
    cmEditor.focus();
}

// ── Default templates ─────────────────────────────────────────────────────────
function getDefaultScript(type) {
    const tpl = {
        Cube:    rotateBobTpl('Cube'),
        Sphere:  rotateBobTpl('Sphere'),
        Cylinder:rotateBobTpl('Cylinder'),
        Torus:   rotateBobTpl('Torus'),
        Cone:    rotateBobTpl('Cone'),
        Plane:   `// Plane Script\nstart(() => {\n  debug.log('Plane ready');\n});\n\nupdate((dt) => {\n  // Plane stays still by default\n});\n`,
        PointLight:      lightPulseTpl(),
        SpotLight:       lightPulseTpl(),
        VolumetricLight: godRayTpl(),
        DirectionalLight:sunCycleTpl(),
        Camera:  cameraOrbitTpl(),
        Empty:   emptyTpl(),
    };
    return tpl[type] || emptyTpl();
}

function rotateBobTpl(t) { return `// ${t} Script
// API: self transform material scene input time camera debug math audio events physics postfx

start(() => {
  self.data.startY = transform.position.y;
  debug.log('${t} started!');
});

update((dt) => {
  transform.rotate(0, 60 * dt, 0);
  const bob = Math.sin(time.now * 2) * 0.3;
  const p = transform.position;
  transform.setPosition(p.x, self.data.startY + bob, p.z);
});
`; }

function lightPulseTpl() { return `// Light Pulse Script
start(() => { debug.log('Light ready'); });

update((dt) => {
  light.pulse(2, 0.5, 2.0);
  // light.flicker(8, 0.3); // flicker instead
});
`; }

function godRayTpl() { return `// Volumetric / God Ray Script
start(() => {
  light.intensity = 2;
  debug.log('God rays active');
});

update((dt) => {
  // Animate god ray intensity
  const t = time.now;
  light.intensity = 1.5 + Math.sin(t * 0.5) * 0.3;
  // Subtle color shift
  const warm = Math.sin(t * 0.2) * 0.5 + 0.5;
  light.color = \`hsl(\${30 + warm * 20}, 90%, 80%)\`;
});
`; }

function sunCycleTpl() { return `// Directional Light — Day/Night Cycle
start(() => {
  self.data.angle = 0;
});

update((dt) => {
  self.data.angle += dt * 0.1;  // full cycle in ~63s
  const a = self.data.angle;
  transform.setPosition(Math.sin(a) * 10, Math.cos(a) * 10, 5);
  // Color: dawn/dusk warm, noon white, night dark
  const t = (Math.cos(a) + 1) / 2;
  light.intensity = t * 1.5;
  light.color = t > 0.5 ? '#fff5e0' : '#ff7a30';
});
`; }

function cameraOrbitTpl() { return `// Camera Orbit Script
start(() => {
  self.data.angle = 0;
  self.data.radius = 8;
  debug.log('Camera orbit started');
});

update((dt) => {
  self.data.angle += dt * 0.5;
  const a = self.data.angle;
  const r = self.data.radius;
  camera.setPosition(Math.sin(a) * r, 3, Math.cos(a) * r);
  camera.lookAt(0, 0, 0);
});
`; }

function emptyTpl() { return `// Object Script
// API: self transform material scene input time camera debug math audio events physics postfx

start(() => {
  debug.log(self.name + ' started!');
});

update((dt) => {
  // Your logic here
});
`; }

// ── API Reference data ────────────────────────────────────────────────────────
const API_REF = [
    { category:'Transform', color:'#4af', entries:[
        { sig:'transform.setPosition(x,y,z)', desc:'Set world position' },
        { sig:'transform.translate(x,y,z)',   desc:'Move by delta' },
        { sig:'transform.rotate(x,y,z)',      desc:'Rotate by degrees/frame' },
        { sig:'transform.setRotation(x,y,z)', desc:'Set rotation in degrees' },
        { sig:'transform.setScale(x,y,z)',    desc:'Set scale' },
        { sig:'transform.lookAt(x,y,z)',      desc:'Face a world point' },
        { sig:'transform.position',           desc:'→ {x,y,z} local position' },
        { sig:'transform.getWorldPosition()', desc:'→ {x,y,z} world position' },
        { sig:'transform.getForward()',       desc:'→ {x,y,z} forward vector' },
    ]},
    { category:'Material', color:'#fa6', entries:[
        { sig:'material.setColor(hex)',        desc:'Set material color' },
        { sig:'material.color',                desc:'Get/set hex color' },
        { sig:'material.roughness',            desc:'0–1 surface roughness' },
        { sig:'material.metalness',            desc:'0–1 metallic look' },
        { sig:'material.opacity',              desc:'0–1 transparency' },
        { sig:'material.wireframe',            desc:'true/false wireframe' },
        { sig:'material.setEmissive(hex,i)',   desc:'Set glow color + intensity' },
    ]},
    { category:'Light', color:'#ff0', entries:[
        { sig:'light.intensity',   desc:'Get/set intensity' },
        { sig:'light.color',       desc:'Get/set hex color' },
        { sig:'light.pulse(speed,min,max)', desc:'Animate intensity over time' },
        { sig:'light.flicker(speed,chaos)', desc:'Random flicker effect' },
        { sig:'light.shadowEnabled', desc:'Get/set cast shadow' },
    ]},
    { category:'Physics', color:'#e67', entries:[
        { sig:'physics.applyImpulse(x,y,z)',   desc:'Instant impulse force' },
        { sig:'physics.applyForce(x,y,z)',     desc:'Continuous force' },
        { sig:'physics.setVelocity(x,y,z)',    desc:'Set linear velocity' },
        { sig:'physics.getVelocity()',         desc:'→ {x,y,z} velocity' },
        { sig:'physics.setGravityScale(s)',    desc:'Override gravity ×s' },
        { sig:'physics.applyTorque(x,y,z)',   desc:'Rotational impulse' },
        { sig:'physics.onCollision(fn)',       desc:'fn(other, id, entered)' },
        { sig:'physics.wakeUp()',              desc:'Wake sleeping body' },
        { sig:'physics.bodyType',             desc:'dynamic|static|kinematic' },
    ]},
    { category:'Scene', color:'#8f8', entries:[
        { sig:'scene.find(name)',          desc:'Find object by name' },
        { sig:'scene.findByTag(tag)',      desc:'→ array of object APIs' },
        { sig:'scene.findById(id)',        desc:'Find by UUID' },
        { sig:'scene.getAllObjects()',     desc:'→ [{name,id,type}]' },
        { sig:'scene.setFog(color,n,f)',  desc:'Add distance fog' },
        { sig:'scene.backgroundColor',   desc:'Get/set BG color hex' },
        { sig:'scene.instantiate(type,name,x,y,z)', desc:'Spawn object at runtime' },
    ]},
    { category:'Camera', color:'#c8f', entries:[
        { sig:'camera.setPosition(x,y,z)',      desc:'Move editor camera' },
        { sig:'camera.lookAt(x,y,z)',           desc:'Point camera at pos' },
        { sig:'camera.shake(intensity,ms)',     desc:'Screen shake effect' },
        { sig:'camera.fov',                     desc:'Get/set field of view' },
        { sig:'camera.setMainCamera(name)',     desc:'Switch main camera to named obj' },
        { sig:'camera.getMainCameraName()',     desc:'→ current main camera name' },
        { sig:'camera.exposure',               desc:'Get/set tone mapping exposure' },
    ]},
    { category:'Input', color:'#f8a', entries:[
        { sig:'input.isKeyDown(key)',    desc:'Is key held (e.g. "w", "ArrowLeft")' },
        { sig:'input.isKeyPressed(key)','desc':'Is key pressed this frame' },
        { sig:'input.isMouseDown(btn)', desc:'Mouse button down (0=L,1=M,2=R)' },
        { sig:'input.getMousePosition()','desc':'→ {x,y,nx,ny} mouse coords' },
    ]},
    { category:'Time', color:'#adf', entries:[
        { sig:'time.now',        desc:'Seconds since play started' },
        { sig:'time.fps',        desc:'Current frames per second' },
        { sig:'time.dt',         desc:'Delta time this frame' },
        { sig:'time.sin(speed)', desc:'Oscillate -1..1' },
        { sig:'time.pingPong(s)','desc':'Oscillate 0..1' },
    ]},
    { category:'Math', color:'#ff8', entries:[
        { sig:'math.lerp(a,b,t)',          desc:'Linear interpolate' },
        { sig:'math.clamp(v,min,max)',     desc:'Clamp value' },
        { sig:'math.distance(a,b)',        desc:'3D distance between {x,y,z}' },
        { sig:'math.random(min,max)',      desc:'Random float' },
        { sig:'math.randomInt(min,max)',   desc:'Random integer' },
        { sig:'math.normalize(vec)',       desc:'Normalize {x,y,z}' },
        { sig:'math.map(v,a,b,c,d)',       desc:'Remap value range' },
    ]},
    { category:'PostFX', color:'#c5f', entries:[
        { sig:'postfx.bloom.enabled=true',       desc:'Toggle bloom' },
        { sig:'postfx.bloom.strength=0.8',       desc:'Bloom brightness' },
        { sig:'postfx.bloom.pulse(speed,min,max)','desc':'Animate bloom' },
        { sig:'postfx.dof.enabled=true',         desc:'Toggle depth of field' },
        { sig:'postfx.dof.focus=10',             desc:'DOF focus distance' },
        { sig:'postfx.chroma.enabled=true',      desc:'Chromatic aberration' },
        { sig:'postfx.vignette.enabled=true',    desc:'Vignette' },
        { sig:'postfx.grain.enabled=true',       desc:'Film grain' },
        { sig:"postfx.preset('neon')",           desc:'Presets: neon/horror/cinematic/reset' },
    ]},
    { category:'Self', color:'#8cf', entries:[
        { sig:'self.name',           desc:'Get/set object name' },
        { sig:'self.active',         desc:'Get/set visibility' },
        { sig:'self.data',           desc:'Persistent per-script data store' },
        { sig:'self.destroy()',      desc:'Remove object from scene' },
        { sig:'self.clone()',        desc:'Duplicate this object' },
        { sig:'self.addTag(tag)',    desc:'Add tag string' },
        { sig:'self.hasTag(tag)',    desc:'Check tag' },
        { sig:'self.getChildren()', desc:'→ array of child APIs' },
    ]},
    { category:'Events', color:'#f8c', entries:[
        { sig:'events.emit(name,data)', desc:'Broadcast event to all scripts' },
        { sig:'events.on(name,fn)',     desc:'Listen to event' },
    ]},
    { category:'Audio', color:'#8fa', entries:[
        { sig:'audio.playTone(freq,dur,type)', desc:'type: sine|square|triangle|sawtooth' },
    ]},
];

const SNIPPETS = [
    { name:'Rotate',    code:`transform.rotate(0, 90 * dt, 0);` },
    { name:'Bob',       code:`transform.setPosition(transform.position.x, self.data.startY + Math.sin(time.now*2)*0.3, transform.position.z);` },
    { name:'WASD Move', code:`const spd=4;\nif(input.isKeyDown('w')) transform.translate(0,0,-spd*dt);\nif(input.isKeyDown('s')) transform.translate(0,0,spd*dt);\nif(input.isKeyDown('a')) transform.translate(-spd*dt,0,0);\nif(input.isKeyDown('d')) transform.translate(spd*dt,0,0);` },
    { name:'Jump',      code:`if(input.isKeyPressed(' ')) physics.applyImpulse(0, 8, 0);` },
    { name:'Explode',   code:`physics.applyImpulse(math.random(-6,6), math.random(4,10), math.random(-6,6));` },
    { name:'Look At',   code:`const t = scene.find('Target');\nif(t) transform.lookAt(t.transform.position.x, t.transform.position.y, t.transform.position.z);` },
    { name:'Bloom On',  code:`postfx.bloom.enabled = true;\npostfx.bloom.strength = 1.2;` },
    { name:'Cam Shake', code:`camera.shake(0.3, 400);` },
    { name:'Flicker',   code:`light.flicker(8, 0.4);` },
    { name:'Switch Cam',code:`camera.setMainCamera('Camera 2');` },
    { name:'Color Lerp',code:`const t = time.pingPong(0.5);\nmaterial.setColor(\`hsl(\${Math.floor(t*360)},80%,60%)\`);` },
    { name:'Self Data', code:`if(!self.data.init){\n  self.data.init=true;\n  self.data.counter=0;\n}\nself.data.counter += dt;` },
];

function buildAPIReference() {
    const container = document.getElementById('api-ref-content');
    if (!container) return;
    container.innerHTML = API_REF.map(cat => `
        <div class="api-category">
            <div class="api-cat-header" style="color:${cat.color}">${cat.category}</div>
            ${cat.entries.map(e => `
            <div class="api-entry" onclick="insertSnippet('${e.sig.replace(/'/g,"\\'")}')" title="${e.desc}">
                <span class="api-sig">${e.sig}</span>
                <span class="api-desc">${e.desc}</span>
            </div>`).join('')}
        </div>`).join('');
}

function filterAPIRef() {
    const q = document.getElementById('api-search')?.value?.toLowerCase() || '';
    document.querySelectorAll('.api-entry').forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
    document.querySelectorAll('.api-category').forEach(el => {
        const vis = [...el.querySelectorAll('.api-entry')].some(e=>e.style.display!=='none');
        el.style.display = vis ? '' : 'none';
    });
}

function renderSnippets() {
    const c = document.getElementById('snippet-list');
    if (!c) return;
    c.innerHTML = SNIPPETS.map(s => `
        <button class="snippet-btn" onclick="insertSnippet(${JSON.stringify(s.code)})">${s.name}</button>
    `).join('');
}

// ── Sidebar tab switch ────────────────────────────────────────────────────────
function switchSidebarTab(tab) {
    ['api','snippets','library'].forEach(t => {
        document.getElementById(`se-tab-${t}`)?.classList.toggle('active', t===tab);
        document.getElementById(`se-panel-${t}`)?.classList.toggle('hidden', t!==tab);
    });
    if (tab === 'library') renderScriptLibraryUI();
}

function initScriptEditor() {
    // Shortcut close
    document.getElementById('script-editor-overlay')?.addEventListener('keydown', e => {
        if (e.key === 'Escape') { closeScriptEditor(scriptEditorDirty); }
    });
}
