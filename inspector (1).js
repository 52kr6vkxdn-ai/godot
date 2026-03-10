/**
 * inspector.js
 * – Object inspector: transform, script, material, lights, physics, camera
 * – Scene Properties panel (shown when NO object selected):
 *     HDR env map upload, tone mapping, exposure, shadow quality, background
 * – Advanced light section: god-rays settings, bounce light count, cinematic presets
 * – Camera section: Set as Main Camera button
 */

// ── Selection ─────────────────────────────────────────────────────────────────
function selectObject(obj) {
    selectedObject = obj;
    updateHierarchyUI();

    const empty  = document.getElementById('inspector-empty');   // scene props
    const props  = document.getElementById('inspector-props');
    const icon   = document.getElementById('insp-icon');
    const name   = document.getElementById('insp-name');

    if (obj) {
        transformControls.attach(obj.object);
        empty.classList.add('hidden');
        props.classList.remove('hidden');

        const icons = { Camera:'fa-video', DirectionalLight:'fa-sun', PointLight:'fa-lightbulb',
                        SpotLight:'fa-bullseye', Empty:'fa-box', VolumetricLight:'fa-sun',
                        AreaLight:'fa-rectangle-wide', HemisphereLight:'fa-circle-half-stroke' };
        icon.className = `fas ${icons[obj.type] || 'fa-cube'} insp-obj-icon`;
        name.value = obj.name;
        updateInspectorFromObject();
        buildDynamicInspector(obj);
        if (typeof updateTagsInspector === 'function') updateTagsInspector();
    } else {
        transformControls.detach();
        empty.classList.remove('hidden');
        props.classList.add('hidden');
        buildScenePropertiesPanel();
    }
}

// ── Transform I/O ─────────────────────────────────────────────────────────────
function updateInspectorFromObject() {
    if (!selectedObject) return;
    const o = selectedObject.object;
    setValue('pos-x', o.position.x); setValue('pos-y', o.position.y); setValue('pos-z', o.position.z);
    setValue('rot-x', THREE.MathUtils.radToDeg(o.rotation.x));
    setValue('rot-y', THREE.MathUtils.radToDeg(o.rotation.y));
    setValue('rot-z', THREE.MathUtils.radToDeg(o.rotation.z));
    setValue('scl-x', o.scale.x); setValue('scl-y', o.scale.y); setValue('scl-z', o.scale.z);
}
function setValue(id,val) {
    const el=document.getElementById(id);
    if(el&&document.activeElement!==el) el.value=parseFloat(val).toFixed(3);
}
function applyInspectorToObject() {
    if (!selectedObject) return;
    const o = selectedObject.object;
    o.position.set(
        parseFloat(document.getElementById('pos-x').value)||0,
        parseFloat(document.getElementById('pos-y').value)||0,
        parseFloat(document.getElementById('pos-z').value)||0);
    o.rotation.set(
        THREE.MathUtils.degToRad(parseFloat(document.getElementById('rot-x').value)||0),
        THREE.MathUtils.degToRad(parseFloat(document.getElementById('rot-y').value)||0),
        THREE.MathUtils.degToRad(parseFloat(document.getElementById('rot-z').value)||0));
    o.scale.set(
        parseFloat(document.getElementById('scl-x').value)||1,
        parseFloat(document.getElementById('scl-y').value)||1,
        parseFloat(document.getElementById('scl-z').value)||1);
    if (o.userData.helper?.update) o.userData.helper.update();
}
function resetTransform(part) {
    if (!selectedObject) return;
    const o = selectedObject.object;
    if (part==='pos') o.position.set(0,0,0);
    if (part==='rot') o.rotation.set(0,0,0);
    if (part==='scl') o.scale.set(1,1,1);
    updateInspectorFromObject();
    recordHistory(`Reset ${part}: ${selectedObject.name}`);
}

// ── Dynamic Inspector ─────────────────────────────────────────────────────────
function buildDynamicInspector(obj) {
    const dyn = document.getElementById('inspector-dynamic');
    dyn.innerHTML = '';

    dyn.appendChild(buildScriptSection(obj));

    if (obj.type === 'Camera') dyn.appendChild(buildCameraSection(obj));

    const meshTypes = ['Cube','Sphere','Plane','Cylinder','Torus','Cone','Icosphere','Ring','TorusKnot','Capsule'];
    if (meshTypes.includes(obj.type)) dyn.appendChild(buildMaterialSection(obj));

    const lightTypes = ['DirectionalLight','PointLight','SpotLight','HemisphereLight','AreaLight','VolumetricLight'];
    if (lightTypes.includes(obj.type)) dyn.appendChild(buildLightSection(obj));

    dyn.appendChild(buildPhysicsSection(obj));

    if (obj.components?.length) dyn.appendChild(buildComponentsSection(obj));
}

// ── SCENE PROPERTIES PANEL (shown when nothing selected) ──────────────────────
function buildScenePropertiesPanel() {
    const panel = document.getElementById('inspector-empty');
    panel.innerHTML = `
    <div class="scene-props-header"><i class="fas fa-globe"></i> Scene Properties</div>
    <div class="scene-props-body">

      <!-- Environment / HDR -->
      <details class="inspector-section" open>
        <summary><i class="fas fa-image" style="margin-right:6px;color:#4af;"></i>Environment</summary>
        <div class="inspector-content-inner">
          <div class="prop-row" style="flex-direction:column;align-items:flex-start;gap:6px;">
            <div style="font-size:10px;color:var(--text-inactive);">Upload HDR / EXR / panorama image for IBL reflections and environment lighting.</div>
            <label class="upload-btn" for="hdr-file-input"><i class="fas fa-upload"></i> Upload HDR / Image</label>
            <input type="file" id="hdr-file-input" accept=".hdr,.exr,.png,.jpg,.jpeg,.webp" style="display:none;" onchange="loadHDRFromFile(this.files[0])">
          </div>
          <div style="font-size:10px;color:var(--text-inactive);margin:4px 0 6px;">Quick presets:</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">
            <button class="snippet-btn" onclick="applyEnvPreset('sunset')">🌅 Sunset</button>
            <button class="snippet-btn" onclick="applyEnvPreset('studio')">💡 Studio</button>
            <button class="snippet-btn" onclick="applyEnvPreset('forest')">🌲 Forest</button>
            <button class="snippet-btn" onclick="applyEnvPreset('night')">🌙 Night</button>
            <button class="snippet-btn" onclick="clearEnvironment()">✕ Clear</button>
          </div>
          <div class="prop-row">
            <div class="prop-label">BG Color</div>
            <input type="color" id="scene-bg-color" value="#1a1a1e" style="width:36px;height:22px;border:1px solid var(--border-color);border-radius:3px;cursor:pointer;background:transparent;" oninput="scene.background=new THREE.Color(this.value)">
          </div>
          <div class="prop-row">
            <div class="prop-label">Env Intensity</div>
            <input type="range" id="scene-env-intensity" min="0" max="3" step="0.01" value="1" style="flex:1;" oninput="scene.environmentIntensity=parseFloat(this.value)||1; document.getElementById('scene-env-int-v').innerText=parseFloat(this.value).toFixed(2)">
            <span id="scene-env-int-v" style="width:28px;font-size:10px;text-align:right;">1.00</span>
          </div>
        </div>
      </details>

      <!-- Rendering / Tone Mapping -->
      <details class="inspector-section" open>
        <summary><i class="fas fa-adjust" style="margin-right:6px;color:#fa6;"></i>Rendering</summary>
        <div class="inspector-content-inner">
          <div class="prop-row">
            <div class="prop-label">Tone Map</div>
            <select id="scene-tonemap" class="overlay-select" style="flex:1;height:24px;" onchange="applyToneMapping(this.value)">
              <option value="aces" selected>ACESFilmic</option>
              <option value="linear">Linear</option>
              <option value="reinhard">Reinhard</option>
              <option value="cineon">Cineon</option>
              <option value="none">None</option>
            </select>
          </div>
          <div class="prop-row">
            <div class="prop-label">Exposure</div>
            <input type="range" id="scene-exposure" min="0.1" max="4" step="0.01" value="1" style="flex:1;" oninput="renderer.toneMappingExposure=parseFloat(this.value); document.getElementById('scene-exp-v').innerText=parseFloat(this.value).toFixed(2)">
            <span id="scene-exp-v" style="width:28px;font-size:10px;text-align:right;">1.00</span>
          </div>
          <div class="prop-row">
            <div class="prop-label">Shadow Quality</div>
            <select id="scene-shadowq" class="overlay-select" style="flex:1;height:24px;" onchange="applyShadowQuality(this.value)">
              <option value="basic">Basic</option>
              <option value="pcf" selected>PCF Soft</option>
              <option value="pcfsoft">PCF Very Soft</option>
              <option value="vsm">VSM</option>
            </select>
          </div>
          <div class="prop-row">
            <div class="prop-label">Shadows</div>
            <input type="checkbox" id="scene-shadows" checked style="cursor:pointer;" onchange="renderer.shadowMap.enabled=this.checked">
          </div>
          <div class="prop-row">
            <div class="prop-label">Pixel Ratio</div>
            <select id="scene-pixratio" class="overlay-select" style="flex:1;height:24px;" onchange="renderer.setPixelRatio(parseFloat(this.value))">
              <option value="1">1× (Performance)</option>
              <option value="1.5">1.5×</option>
              <option value="2" selected>2× (Quality)</option>
              <option value="${window.devicePixelRatio}">Native (${window.devicePixelRatio.toFixed(1)}×)</option>
            </select>
          </div>
        </div>
      </details>

      <!-- Global Lighting / Bounces -->
      <details class="inspector-section">
        <summary><i class="fas fa-lightbulb" style="margin-right:6px;color:#ff0;"></i>Global Lighting</summary>
        <div class="inspector-content-inner">
          <div style="font-size:10px;color:var(--text-inactive);margin-bottom:8px;">Light bounce count simulates indirect global illumination (GI). Higher = more realistic, lower = faster rendering.</div>
          <div class="prop-row">
            <div class="prop-label">Ambient</div>
            <input type="color" id="scene-ambient-color" value="#404050" style="width:36px;height:22px;border:1px solid var(--border-color);border-radius:3px;cursor:pointer;" oninput="if(ambientLight)ambientLight.color.set(this.value)">
          </div>
          <div class="prop-row">
            <div class="prop-label">Amb Intensity</div>
            <input type="range" id="scene-ambient-int" min="0" max="2" step="0.01" value="0.4" style="flex:1;" oninput="if(ambientLight){ambientLight.intensity=parseFloat(this.value);document.getElementById('scene-amb-int-v').innerText=parseFloat(this.value).toFixed(2);}">
            <span id="scene-amb-int-v" style="width:28px;font-size:10px;text-align:right;">0.40</span>
          </div>
          <div class="prop-row">
            <div class="prop-label">GI Bounces</div>
            <input type="range" id="scene-gi-bounces" min="0" max="8" step="1" value="0" style="flex:1;" oninput="applyGIBounces(parseInt(this.value)); document.getElementById('scene-gi-v').innerText=this.value">
            <span id="scene-gi-v" style="width:20px;font-size:10px;text-align:right;">0</span>
          </div>
          <div id="scene-gi-hint" style="font-size:10px;color:var(--text-inactive);padding:3px 0;"></div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">
            <button class="snippet-btn" onclick="applyLightingPreset('day')">☀ Day</button>
            <button class="snippet-btn" onclick="applyLightingPreset('sunset')">🌅 Sunset</button>
            <button class="snippet-btn" onclick="applyLightingPreset('night')">🌙 Night</button>
            <button class="snippet-btn" onclick="applyLightingPreset('studio')">📸 Studio</button>
            <button class="snippet-btn" onclick="applyLightingPreset('horror')">💀 Horror</button>
          </div>
        </div>
      </details>

      <!-- Fog -->
      <details class="inspector-section">
        <summary><i class="fas fa-cloud" style="margin-right:6px;color:#adf;"></i>Fog</summary>
        <div class="inspector-content-inner">
          <div class="prop-row">
            <div class="prop-label">Enabled</div>
            <input type="checkbox" id="fog-enabled" style="cursor:pointer;" onchange="toggleSceneFog(this.checked)">
          </div>
          <div class="prop-row">
            <div class="prop-label">Color</div>
            <input type="color" id="fog-color" value="#1a1a1e" style="width:36px;height:22px;border:1px solid var(--border-color);border-radius:3px;cursor:pointer;" oninput="updateFog()">
          </div>
          <div class="prop-row">
            <div class="prop-label">Density</div>
            <input type="range" id="fog-density" min="0.001" max="0.1" step="0.001" value="0.008" style="flex:1;" oninput="updateFog(); document.getElementById('fog-dens-v').innerText=parseFloat(this.value).toFixed(3)">
            <span id="fog-dens-v" style="width:36px;font-size:10px;text-align:right;">0.008</span>
          </div>
        </div>
      </details>

      <!-- Post-Processing quick access -->
      <details class="inspector-section">
        <summary><i class="fas fa-magic" style="margin-right:6px;color:#c5f;"></i>Post-Processing</summary>
        <div class="inspector-content-inner">
          <button class="add-component-btn" onclick="initPostFX();logConsole('PostFX initialized','success');" style="background:rgba(197,85,255,.1);border-color:rgba(197,85,255,.4);margin-bottom:8px;"><i class="fas fa-magic"></i> Initialize Post-FX</button>
          <div class="prop-row"><input type="checkbox" id="fx2-bloom" style="cursor:pointer;" onchange="if(postfxSettings)postfxSettings.bloom.enabled=this.checked;applyBloomSettings?.()"> <label style="font-size:11px;cursor:pointer;margin-left:6px;">Bloom</label></div>
          <div class="prop-row"><input type="checkbox" id="fx2-dof" style="cursor:pointer;" onchange="if(postfxSettings)postfxSettings.dof.enabled=this.checked;applyDOFSettings?.()"> <label style="font-size:11px;cursor:pointer;margin-left:6px;">Depth of Field</label></div>
          <div class="prop-row"><input type="checkbox" id="fx2-vignette" style="cursor:pointer;" onchange="if(postfxSettings)postfxSettings.vignette.enabled=this.checked;applyVignetteSettings?.()"> <label style="font-size:11px;cursor:pointer;margin-left:6px;">Vignette</label></div>
          <div class="prop-row"><input type="checkbox" id="fx2-chroma" style="cursor:pointer;" onchange="if(postfxSettings)postfxSettings.chroma.enabled=this.checked;applyChromaSettings?.()"> <label style="font-size:11px;cursor:pointer;margin-left:6px;">Chromatic Aberration</label></div>
          <div class="prop-row"><input type="checkbox" id="fx2-grain" style="cursor:pointer;" onchange="if(postfxSettings)postfxSettings.grain.enabled=this.checked;applyGrainSettings?.()"> <label style="font-size:11px;cursor:pointer;margin-left:6px;">Film Grain</label></div>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">
            <button class="snippet-btn" onclick="buildPostFXScriptAPI?.().preset('neon')">Neon</button>
            <button class="snippet-btn" onclick="buildPostFXScriptAPI?.().preset('horror')">Horror</button>
            <button class="snippet-btn" onclick="buildPostFXScriptAPI?.().preset('cinematic')">Cinematic</button>
            <button class="snippet-btn" onclick="buildPostFXScriptAPI?.().preset('reset')">Reset</button>
          </div>
        </div>
      </details>

    </div>`;
}

// ── Scene property helpers ────────────────────────────────────────────────────
function applyToneMapping(val) {
    const map = { aces:THREE.ACESFilmicToneMapping, linear:THREE.LinearToneMapping,
                  reinhard:THREE.ReinhardToneMapping, cineon:THREE.CineonToneMapping, none:THREE.NoToneMapping };
    renderer.toneMapping = map[val] ?? THREE.ACESFilmicToneMapping;
    renderer.needsUpdate = true;
    logConsole(`Tone mapping: ${val}`, 'info');
}

function applyShadowQuality(val) {
    const map = { basic:THREE.BasicShadowMap, pcf:THREE.PCFShadowMap, pcfsoft:THREE.PCFSoftShadowMap, vsm:THREE.VSMShadowMap };
    renderer.shadowMap.type = map[val] ?? THREE.PCFSoftShadowMap;
    logConsole(`Shadow quality: ${val}`, 'info');
}

function applyGIBounces(n) {
    // Simulate GI bounces by progressively adding fill lights / adjusting ambient
    const hints = ['No GI — direct lighting only.','Low GI — single bounce. Subtle fill.','Balanced — 2 bounces, good for most scenes.',
        'Soft GI — warm indirect fill.','High GI — rich indirect light.','Very High — Blender-quality look.',
        'Ultra — deep global illumination look.','Extreme — film-quality (heavy).','Maximum — most realistic possible.'];
    document.getElementById('scene-gi-hint').innerText = hints[n] || '';
    const intensity = 0.4 + n * 0.18;
    if (ambientLight) ambientLight.intensity = Math.min(intensity, 2.0);
    renderer.toneMappingExposure = 1.0 + n * 0.04;
    const exp = document.getElementById('scene-exposure');
    if (exp) exp.value = renderer.toneMappingExposure;
    logConsole(`GI bounces: ${n} — ambient adjusted to ${ambientLight?.intensity?.toFixed(2)}`, 'info');
}

function toggleSceneFog(on) {
    if (on) {
        const color   = document.getElementById('fog-color')?.value || '#1a1a1e';
        const density = parseFloat(document.getElementById('fog-density')?.value) || 0.008;
        scene.fog = new THREE.FogExp2(color, density);
    } else { scene.fog = null; }
}
function updateFog() {
    const on = document.getElementById('fog-enabled')?.checked;
    if (!on) return;
    const color   = document.getElementById('fog-color')?.value || '#1a1a1e';
    const density = parseFloat(document.getElementById('fog-density')?.value) || 0.008;
    scene.fog = new THREE.FogExp2(color, density);
}

function applyEnvPreset(name) {
    // Build procedural sky-colored ambient/background
    const presets = {
        sunset: { bg:'#1a0a05', ambient:'#ff6030', ambInt:0.6 },
        studio: { bg:'#111115', ambient:'#e8f0ff', ambInt:0.8 },
        forest: { bg:'#0a1a08', ambient:'#204510', ambInt:0.5 },
        night:  { bg:'#03030d', ambient:'#0a0a30', ambInt:0.2 },
    };
    const p = presets[name]; if (!p) return;
    scene.background = new THREE.Color(p.bg);
    if (ambientLight) { ambientLight.color.set(p.ambient); ambientLight.intensity = p.ambInt; }
    const bc = document.getElementById('scene-bg-color'); if (bc) bc.value = p.bg;
    logConsole(`Env preset "${name}" applied.`, 'success');
}

function applyLightingPreset(name) {
    const presets = {
        day:    { ambient:'#c0d8ff', ambInt:0.5, mainColor:'#fff5e0', mainInt:1.2 },
        sunset: { ambient:'#ff7040', ambInt:0.4, mainColor:'#ff5500', mainInt:1.0 },
        night:  { ambient:'#0a0a30', ambInt:0.15,mainColor:'#5060ff', mainInt:0.3 },
        studio: { ambient:'#e8f0ff', ambInt:0.8, mainColor:'#ffffff', mainInt:1.5 },
        horror: { ambient:'#200000', ambInt:0.1, mainColor:'#ff2200', mainInt:0.5 },
    };
    const p = presets[name]; if (!p) return;
    if (ambientLight) { ambientLight.color.set(p.ambient); ambientLight.intensity = p.ambInt; }
    const mainLight = engineObjects.find(o=>o.type==='DirectionalLight');
    if (mainLight?.object.isLight) {
        mainLight.object.color.set(p.mainColor);
        mainLight.object.intensity = p.mainInt;
    }
    logConsole(`Lighting preset "${name}" applied.`, 'success');
}

// ── SCRIPT SECTION ────────────────────────────────────────────────────────────
function buildScriptSection(obj) {
    const sec = document.createElement('details');
    sec.className = 'inspector-section';
    sec.open = true;
    const hasScript = !!(obj.script?.trim());

    sec.innerHTML = `<summary>
        <span style="flex:1;">Script</span>
        ${hasScript ? '<span class="script-badge">JS</span>' : ''}
    </summary>
    <div class="inspector-content-inner">
        ${hasScript
            ? `<div class="script-preview"><pre class="script-preview-code">${escapePreview(obj.script)}</pre></div>`
            : `<div style="color:var(--text-inactive);font-size:11px;margin-bottom:8px;">No script — runs only in ▶ Play.</div>`
        }
        <div style="display:flex;gap:5px;flex-wrap:wrap;">
            <button class="add-component-btn script-open-btn" onclick="openScriptEditor(engineObjects.find(o=>o.id==='${obj.id}'))">
                <i class="fas fa-code"></i> ${hasScript?'Edit':'Create'} Script
            </button>
            ${hasScript ? `<button class="add-component-btn" onclick="clearScript('${obj.id}')" style="background:rgba(192,57,43,.1);border-color:#c0392b;"><i class="fas fa-times"></i> Clear</button>` : ''}
        </div>

        <!-- Load script from external .js file -->
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px;">
            <label class="add-component-btn" for="insp-load-js-${obj.id}" style="cursor:pointer;background:rgba(74,158,255,.06);border-color:rgba(74,158,255,.35);" title="Load a .js file from disk into this object's script">
                <i class="fas fa-file-import"></i> Load from .js File
            </label>
            <input type="file" id="insp-load-js-${obj.id}" accept=".js,text/javascript" style="display:none;"
                   onchange="loadScriptFileIntoObject(this, '${obj.id}')">
            ${hasScript ? `<button class="add-component-btn" onclick="exportObjectScript('${obj.id}')" style="background:rgba(74,158,255,.06);border-color:rgba(74,158,255,.35);" title="Save this script as a .js file"><i class="fas fa-file-export"></i> Export .js</button>` : ''}
        </div>

        <button class="add-component-btn" onclick="openModal('modal-script-library')" style="margin-top:5px;background:rgba(100,200,100,.08);border-color:rgba(100,200,100,.3);">
            <i class="fas fa-book"></i> Script Library
        </button>
    </div>`;
    return sec;
}

// Load a .js file from disk directly into an object's script field
function loadScriptFileIntoObject(input, objId) {
    const file  = input.files[0];
    const entry = engineObjects.find(o => o.id === objId);
    if (!file || !entry) return;
    if (!file.name.endsWith('.js')) { logConsole('Please choose a .js file.', 'warn'); return; }
    const reader = new FileReader();
    reader.onload = e => {
        entry.script = e.target.result;
        logConsole(`Loaded "${file.name}" → "${entry.name}".`, 'success');
        recordHistory(`Load script file: ${entry.name}`);
        // Hot-reload if playing
        if (isPlaying && entry.script.trim()) {
            const c = compileScript(entry);
            if (c?.lifecycle) {
                scriptInstances[entry.id] = c;
                try { if (c.lifecycle.start) c.lifecycle.start(); } catch(er){}
            }
        }
        updateHierarchyUI();
        if (selectedObject?.id === objId) buildDynamicInspector(entry);
    };
    reader.onerror = () => logConsole('File read failed.', 'error');
    reader.readAsText(file);
    input.value = '';  // allow re-loading the same file
}

// Export a single object's script as a .js file
function exportObjectScript(objId) {
    const entry = engineObjects.find(o => o.id === objId);
    if (!entry?.script?.trim()) { logConsole('No script to export.', 'warn'); return; }
    const fileName = `${entry.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.js`;
    const blob = new Blob([entry.script], { type: 'text/javascript' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName; a.click();
    URL.revokeObjectURL(a.href);
    logConsole(`Script exported as "${fileName}".`, 'success');
}

function escapePreview(code) {
    const lines = code.split('\n').slice(0,6);
    const escaped = lines.map(l=>escapeHtml(l)).join('\n');
    const more = code.split('\n').length>6 ? `\n<span style="color:var(--text-inactive)">  ···+${code.split('\n').length-6} lines</span>`:'';
    return escaped + more;
}
function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function clearScript(id) {
    const e=engineObjects.find(o=>o.id===id);
    if(!e||!confirm('Clear this script?')) return;
    e.script=''; buildDynamicInspector(e);
    recordHistory(`Clear script: ${e.name}`);
    logConsole(`Script cleared: "${e.name}"`, 'warn');
}

// ── CAMERA SECTION ────────────────────────────────────────────────────────────
function buildCameraSection(obj) {
    const cam   = obj.object;
    const isMain= obj.id === mainCameraId;
    const sec   = document.createElement('details');
    sec.className = 'inspector-section';
    sec.open = true;

    sec.innerHTML = `<summary>
        <span style="flex:1;">Camera</span>
        ${isMain ? '<span class="script-badge" style="background:#27ae60;">MAIN</span>' : ''}
    </summary>
    <div class="inspector-content-inner">
        <div class="prop-row">
            <div class="prop-label">FOV</div>
            <div class="prop-input-group" style="flex:1;"><input type="number" id="cam-fov" value="${cam.fov||60}" min="10" max="170" step="1" class="insp-input"></div>
        </div>
        <div class="prop-row">
            <div class="prop-label">Near</div>
            <div class="prop-input-group" style="flex:1;"><input type="number" id="cam-near" value="${cam.near||0.1}" step="0.01" class="insp-input"></div>
        </div>
        <div class="prop-row">
            <div class="prop-label">Far</div>
            <div class="prop-input-group" style="flex:1;"><input type="number" id="cam-far" value="${cam.far||1000}" step="10" class="insp-input"></div>
        </div>
        <button class="add-component-btn" id="btn-set-main-cam" onclick="setMainCamera('${obj.id}')"
            style="${isMain?'background:rgba(39,174,96,.15);border-color:#27ae60;':''}">
            <i class="fas fa-${isMain?'check-circle':'video'}"></i> ${isMain?'Is Main Camera':'Set as Main Camera'}
        </button>
    </div>`;

    sec.querySelector('#cam-fov').addEventListener('input', () => {
        cam.fov  = parseFloat(sec.querySelector('#cam-fov').value)||60;
        cam.near = parseFloat(sec.querySelector('#cam-near').value)||0.1;
        cam.far  = parseFloat(sec.querySelector('#cam-far').value)||1000;
        cam.updateProjectionMatrix();
        if (cam.userData.helper?.update) cam.userData.helper.update();
    });
    return sec;
}

// ── MATERIAL SECTION ──────────────────────────────────────────────────────────
function buildMaterialSection(obj) {
    const mat = obj.object.material; if (!mat) return document.createElement('div');
    const hex = '#'+mat.color.getHexString();
    const rough = mat.roughness??0.7, metal = mat.metalness??0.1;

    const sec = document.createElement('details');
    sec.className = 'inspector-section';
    sec.open = true;
    sec.innerHTML = `<summary>Material</summary>
    <div class="inspector-content-inner">
      <div class="prop-row">
        <div class="prop-label">Color</div>
        <div class="prop-inputs" style="gap:6px;align-items:center;">
          <input type="color" id="mat-color" value="${hex}" style="width:36px;height:24px;border:1px solid var(--border-color);background:transparent;cursor:pointer;border-radius:3px;">
          <input type="text" id="mat-color-hex" value="${hex}" style="flex:1;background:var(--bg-primary);border:1px solid var(--border-color);color:var(--text-primary);padding:3px 6px;border-radius:2px;font-family:monospace;font-size:11px;">
        </div>
      </div>
      <div class="prop-row"><div class="prop-label">Roughness</div>
        <input type="range" id="mat-roughness" min="0" max="1" step="0.01" value="${rough}" style="flex:1;">
        <span id="mat-roughness-val" style="width:30px;text-align:right;font-size:11px;">${rough.toFixed(2)}</span>
      </div>
      <div class="prop-row"><div class="prop-label">Metalness</div>
        <input type="range" id="mat-metalness" min="0" max="1" step="0.01" value="${metal}" style="flex:1;">
        <span id="mat-metalness-val" style="width:30px;text-align:right;font-size:11px;">${metal.toFixed(2)}</span>
      </div>
      <div class="prop-row"><div class="prop-label">Opacity</div>
        <input type="range" id="mat-opacity" min="0" max="1" step="0.01" value="${mat.opacity??1}" style="flex:1;">
        <span id="mat-opacity-val" style="width:30px;text-align:right;font-size:11px;">${(mat.opacity??1).toFixed(2)}</span>
      </div>
      <div class="prop-row"><div class="prop-label">Emissive</div>
        <input type="color" id="mat-emissive" value="${mat.emissive?'#'+mat.emissive.getHexString():'#000000'}" style="width:36px;height:22px;border:1px solid var(--border-color);border-radius:3px;cursor:pointer;background:transparent;">
        <input type="range" id="mat-emissive-int" min="0" max="3" step="0.05" value="${mat.emissiveIntensity||0}" style="flex:1;margin-left:6px;" title="Emissive intensity">
      </div>
      <div class="prop-row"><div class="prop-label">Wireframe</div>
        <input type="checkbox" id="mat-wireframe" ${mat.wireframe?'checked':''} style="cursor:pointer;">
        <div class="prop-label" style="margin-left:12px;">Cast Shadow</div>
        <input type="checkbox" id="mat-cast-shadow" ${obj.object.castShadow?'checked':''} style="cursor:pointer;margin-left:6px;">
      </div>
    </div>`;

    const updateMat = () => {
        mat.color.set(sec.querySelector('#mat-color').value);
        sec.querySelector('#mat-color-hex').value = '#'+mat.color.getHexString();
        mat.roughness = parseFloat(sec.querySelector('#mat-roughness').value);
        sec.querySelector('#mat-roughness-val').innerText = mat.roughness.toFixed(2);
        mat.metalness = parseFloat(sec.querySelector('#mat-metalness').value);
        sec.querySelector('#mat-metalness-val').innerText = mat.metalness.toFixed(2);
        const op = parseFloat(sec.querySelector('#mat-opacity').value);
        mat.opacity = op; mat.transparent = op < 1;
        sec.querySelector('#mat-opacity-val').innerText = op.toFixed(2);
        mat.emissive = new THREE.Color(sec.querySelector('#mat-emissive').value);
        mat.emissiveIntensity = parseFloat(sec.querySelector('#mat-emissive-int').value);
        mat.wireframe = sec.querySelector('#mat-wireframe').checked;
        obj.object.castShadow = sec.querySelector('#mat-cast-shadow').checked;
        mat.needsUpdate = true;
    };
    sec.querySelectorAll('input').forEach(el => el.addEventListener('input', updateMat));
    sec.querySelector('#mat-color-hex').addEventListener('change', e => {
        if (/^#[0-9a-f]{6}$/i.test(e.target.value)) {
            sec.querySelector('#mat-color').value = e.target.value;
            updateMat();
        }
    });
    return sec;
}

// ── LIGHT SECTION ─────────────────────────────────────────────────────────────
function buildLightSection(obj) {
    const light  = obj.object;
    const hexCol = '#' + (light.color?.getHexString() || 'ffffff');
    const isVol  = obj.type === 'VolumetricLight';
    const isArea = obj.type === 'AreaLight';

    const sec = document.createElement('details');
    sec.className = 'inspector-section';
    sec.open = true;

    // Type-specific HTML
    let extraHTML = '';
    if (obj.type === 'PointLight') {
        extraHTML = `<div class="prop-row"><div class="prop-label">Distance</div>
            <div class="prop-input-group" style="flex:1;"><input type="number" id="light-distance" value="${light.distance||20}" step="1" min="0" class="insp-input"></div></div>
            <div class="prop-row"><div class="prop-label">Decay</div>
            <input type="range" id="light-decay" min="0" max="4" step="0.1" value="${light.decay||2}" style="flex:1;">
            <span id="light-decay-val" style="width:30px;font-size:10px;text-align:right;">${(light.decay||2).toFixed(1)}</span></div>`;
    }
    if (obj.type === 'SpotLight' || isVol) {
        extraHTML += `<div class="prop-row"><div class="prop-label">Angle</div>
            <input type="range" id="light-angle" min="1" max="89" step="1" value="${Math.round(THREE.MathUtils.radToDeg(light.angle||0.5))}" style="flex:1;">
            <span id="light-angle-val" style="width:36px;font-size:10px;text-align:right;">${Math.round(THREE.MathUtils.radToDeg(light.angle||0.5))}°</span></div>
            <div class="prop-row"><div class="prop-label">Penumbra</div>
            <input type="range" id="light-penumbra" min="0" max="1" step="0.01" value="${light.penumbra||0.2}" style="flex:1;">
            <span id="light-pen-val" style="width:30px;font-size:10px;text-align:right;">${(light.penumbra||0.2).toFixed(2)}</span></div>`;
    }
    if (isArea) {
        extraHTML += `
            <div class="prop-row"><div class="prop-label">Width</div>
                <div class="prop-input-group" style="flex:1;"><input type="number" id="light-area-w" value="${light.width||4}" step="0.5" min="0.1" class="insp-input"></div>
            </div>
            <div class="prop-row"><div class="prop-label">Height</div>
                <div class="prop-input-group" style="flex:1;"><input type="number" id="light-area-h" value="${light.height||4}" step="0.5" min="0.1" class="insp-input"></div>
            </div>
            <div style="font-size:10px;color:var(--text-inactive);padding:3px 0 4px;">
                ℹ RectAreaLight does not cast shadows (WebGL limitation).
                Use a SpotLight or DirectionalLight for shadows.
            </div>`;
    }

    // God ray section for volumetric
    let godRayHTML = '';
    if (isVol) {
        const gr = light.userData;
        godRayHTML = `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-color);">
            <div style="font-size:10px;font-weight:700;color:#ff0;letter-spacing:.3px;margin-bottom:8px;">☀ GOD RAY SETTINGS</div>
            <div class="prop-row"><div class="prop-label">Density</div>
                <input type="range" id="gr-density" min="0" max="1" step="0.01" value="${gr.godRayDensity||0.8}" style="flex:1;">
                <span id="gr-density-v" style="width:30px;font-size:10px;">${(gr.godRayDensity||0.8).toFixed(2)}</span></div>
            <div class="prop-row"><div class="prop-label">Weight</div>
                <input type="range" id="gr-weight" min="0" max="1" step="0.01" value="${gr.godRayWeight||0.5}" style="flex:1;">
                <span id="gr-weight-v" style="width:30px;font-size:10px;">${(gr.godRayWeight||0.5).toFixed(2)}</span></div>
            <div class="prop-row"><div class="prop-label">Exposure</div>
                <input type="range" id="gr-exposure" min="0" max="1" step="0.01" value="${gr.godRayExposure||0.4}" style="flex:1;">
                <span id="gr-exp-v" style="width:30px;font-size:10px;">${(gr.godRayExposure||0.4).toFixed(2)}</span></div>
            <div class="prop-row"><div class="prop-label">Decay</div>
                <input type="range" id="gr-decay" min="0.8" max="1" step="0.001" value="${gr.godRayDecay||0.95}" style="flex:1;">
                <span id="gr-decay-v" style="width:30px;font-size:10px;">${(gr.godRayDecay||0.95).toFixed(3)}</span></div>
            <div class="prop-row"><div class="prop-label">Samples</div>
                <input type="range" id="gr-samples" min="10" max="200" step="10" value="${gr.godRaySamples||100}" style="flex:1;">
                <span id="gr-samples-v" style="width:30px;font-size:10px;">${gr.godRaySamples||100}</span></div>
            <div class="prop-row"><div class="prop-label">Cone Opacity</div>
                <input type="range" id="gr-cone-op" min="0" max="0.3" step="0.005" value="${gr.godRayCone?.material?.opacity||0.07}" style="flex:1;"></div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:8px;">
                <button class="snippet-btn" onclick="applyGodRayPreset('${obj.id}','sun')">☀ Sun</button>
                <button class="snippet-btn" onclick="applyGodRayPreset('${obj.id}','window')">🪟 Window</button>
                <button class="snippet-btn" onclick="applyGodRayPreset('${obj.id}','cinema')">🎬 Cinema</button>
                <button class="snippet-btn" onclick="applyGodRayPreset('${obj.id}','eerie')">👁 Eerie</button>
            </div>
        </div>`;
    }

    // Cinematic light presets
    const presetHTML = `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border-color);">
            <div style="font-size:10px;color:var(--text-inactive);margin-bottom:5px;">Cinematic presets:</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
                <button class="snippet-btn" onclick="applyCinemaPreset('${obj.id}','warm')">🌅 Warm</button>
                <button class="snippet-btn" onclick="applyCinemaPreset('${obj.id}','cold')">❄ Cold</button>
                <button class="snippet-btn" onclick="applyCinemaPreset('${obj.id}','dramatic')">🎭 Dramatic</button>
                <button class="snippet-btn" onclick="applyCinemaPreset('${obj.id}','neon')">💜 Neon</button>
            </div>
        </div>`;

    sec.innerHTML = `<summary>
        <span style="flex:1;">${isVol ? '☀ Volumetric Light' : obj.type.replace('Light',' Light')}</span>
    </summary>
    <div class="inspector-content-inner">
      <div class="prop-row"><div class="prop-label">Color</div>
        <div class="prop-inputs" style="gap:6px;align-items:center;">
          <input type="color" id="light-color" value="${hexCol}" style="width:36px;height:24px;border:1px solid var(--border-color);background:transparent;cursor:pointer;border-radius:3px;">
          <span style="font-size:10px;color:var(--text-inactive);flex:1;">${obj.type}</span>
        </div>
      </div>
      <div class="prop-row"><div class="prop-label">Intensity</div>
        <input type="range" id="light-intensity" min="0" max="${isVol?10:isArea?20:5}" step="0.05" value="${light.intensity||1}" style="flex:1;">
        <span id="light-int-val" style="width:30px;text-align:right;font-size:11px;">${(light.intensity||1).toFixed(2)}</span>
      </div>
      ${!isArea ? `
      <div class="prop-row"><div class="prop-label">Shadows</div>
        <input type="checkbox" id="light-shadows" ${light.castShadow?'checked':''} style="cursor:pointer;">
        <div class="prop-label" style="margin-left:12px;">Shadow Bias</div>
        <div class="prop-input-group" style="flex:1;margin-left:6px;"><input type="number" id="light-shadow-bias" value="${(light.shadow?.bias||0).toFixed(5)}" step="0.00005" class="insp-input"></div>
      </div>` : ''}
      ${extraHTML}
      ${godRayHTML}
      ${presetHTML}
    </div>`;

    // Wire up main controls
    sec.querySelector('#light-color').addEventListener('input', e => {
        light.color.set(e.target.value);
        if (light.userData.helper?.update) light.userData.helper.update();
    });
    sec.querySelector('#light-intensity').addEventListener('input', e => {
        light.intensity = parseFloat(e.target.value);
        sec.querySelector('#light-int-val').innerText = light.intensity.toFixed(2);
        if (isVol && light.userData.godRayCone) {
            light.userData.godRayCone.material.opacity = Math.min(light.intensity * 0.035, 0.3);
        }
    });
    sec.querySelector('#light-shadows')?.addEventListener('change', e => {
        light.castShadow = e.target.checked;
    });
    const biasEl = sec.querySelector('#light-shadow-bias');
    if (biasEl) biasEl.addEventListener('input', e => {
        if (light.shadow) light.shadow.bias = parseFloat(e.target.value)||0;
    });

    if (obj.type === 'PointLight') {
        sec.querySelector('#light-distance')?.addEventListener('input', e => {
            light.distance = parseFloat(e.target.value)||0;
        });
        sec.querySelector('#light-decay')?.addEventListener('input', e => {
            light.decay = parseFloat(e.target.value)||2;
            sec.querySelector('#light-decay-val').innerText = light.decay.toFixed(1);
        });
    }
    if (obj.type === 'SpotLight' || isVol) {
        sec.querySelector('#light-angle')?.addEventListener('input', e => {
            light.angle = THREE.MathUtils.degToRad(parseFloat(e.target.value));
            sec.querySelector('#light-angle-val').innerText = e.target.value+'°';
            if (light.userData.helper?.update) light.userData.helper.update();
        });
        sec.querySelector('#light-penumbra')?.addEventListener('input', e => {
            light.penumbra = parseFloat(e.target.value);
            sec.querySelector('#light-pen-val').innerText = parseFloat(e.target.value).toFixed(2);
        });
    }
    if (isArea) {
        const updateAreaHelper = () => {
            // RectAreaLightHelper updates itself on the next frame via its update() — but
            // if the user has changed size we dispose/recreate geometry to stay accurate.
            if (light.userData.helper && THREE.RectAreaLightHelper &&
                light.userData.helper instanceof THREE.RectAreaLightHelper) {
                light.userData.helper.update?.();
            }
        };
        sec.querySelector('#light-area-w')?.addEventListener('input', e => {
            light.width  = Math.max(0.1, parseFloat(e.target.value) || 4);
            updateAreaHelper();
        });
        sec.querySelector('#light-area-h')?.addEventListener('input', e => {
            light.height = Math.max(0.1, parseFloat(e.target.value) || 4);
            updateAreaHelper();
        });
    }

    // God ray controls
    if (isVol) {
        const gr = light.userData;
        const bindGR = (id, key) => {
            const el = sec.querySelector('#'+id); if (!el) return;
            el.addEventListener('input', e => {
                gr[key] = parseFloat(e.target.value);
                const v = sec.querySelector('#'+id+'-v'); if (v) v.innerText = parseFloat(e.target.value).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
                if (id === 'gr-cone-op' && gr.godRayCone?.material) gr.godRayCone.material.opacity = parseFloat(e.target.value);
            });
        };
        bindGR('gr-density',  'godRayDensity');
        bindGR('gr-weight',   'godRayWeight');
        bindGR('gr-exposure', 'godRayExposure');
        bindGR('gr-decay',    'godRayDecay');
        bindGR('gr-samples',  'godRaySamples');
    }

    return sec;
}

// God ray & cinema presets
function applyGodRayPreset(id, preset) {
    const entry = engineObjects.find(o=>o.id===id); if (!entry) return;
    const gr = entry.object.userData;
    const presets = {
        sun:    { godRayDensity:0.96, godRayWeight:0.6, godRayExposure:0.45, godRayDecay:0.97, color:'#fff5a0', intensity:3 },
        window: { godRayDensity:0.9,  godRayWeight:0.4, godRayExposure:0.3,  godRayDecay:0.96, color:'#ffe8c0', intensity:2 },
        cinema: { godRayDensity:0.8,  godRayWeight:0.5, godRayExposure:0.4,  godRayDecay:0.95, color:'#ffd080', intensity:2.5 },
        eerie:  { godRayDensity:0.7,  godRayWeight:0.3, godRayExposure:0.2,  godRayDecay:0.93, color:'#40ff80', intensity:1.5 },
    };
    const p = presets[preset]; if (!p) return;
    Object.assign(gr, p);
    entry.object.color.set(p.color);
    entry.object.intensity = p.intensity;
    if (selectedObject?.id === id) buildDynamicInspector(entry);
    logConsole(`God ray preset "${preset}" applied to "${entry.name}".`, 'success');
}

function applyCinemaPreset(id, preset) {
    const entry = engineObjects.find(o=>o.id===id); if (!entry) return;
    const light = entry.object;
    const presets = {
        warm:     { color:'#ff8c40', intensity:1.5 },
        cold:     { color:'#4080ff', intensity:1.2 },
        dramatic: { color:'#ffffff', intensity:3.0 },
        neon:     { color:'#c040ff', intensity:2.0 },
    };
    const p = presets[preset]; if (!p) return;
    light.color.set(p.color); light.intensity = p.intensity;
    if (light.userData.helper?.update) light.userData.helper.update();
    if (selectedObject?.id === id) buildDynamicInspector(entry);
    logConsole(`Cinema preset "${preset}" applied.`, 'success');
}

// ── PHYSICS SECTION ───────────────────────────────────────────────────────────
function buildPhysicsSection(obj) {
    if (!obj.physics) obj.physics = defaultPhysicsConfig();
    const p = obj.physics;
    const sec = document.createElement('details');
    sec.className = 'inspector-section';

    sec.innerHTML = `<summary>
        <span style="flex:1;">Rigidbody</span>
        ${p.enabled ? '<span class="script-badge" style="background:#e67e22;">PHYSICS</span>' : ''}
    </summary>
    <div class="inspector-content-inner">
      <div class="prop-row">
        <div class="prop-label">Enabled</div>
        <input type="checkbox" id="phys-enabled" ${p.enabled?'checked':''} style="cursor:pointer;">
        <span style="font-size:10px;color:#e67e22;margin-left:6px;">Active in ▶ Play only</span>
      </div>
      <div id="phys-opts" style="display:${p.enabled?'block':'none'}">
        <div class="prop-row"><div class="prop-label">Body Type</div>
          <select id="phys-type" class="overlay-select" style="flex:1;height:24px;">
            <option value="dynamic"   ${p.bodyType==='dynamic'  ?'selected':''}>Dynamic</option>
            <option value="static"    ${p.bodyType==='static'   ?'selected':''}>Static</option>
            <option value="kinematic" ${p.bodyType==='kinematic'?'selected':''}>Kinematic</option>
          </select></div>
        <div class="prop-row"><div class="prop-label">Mass</div>
          <div class="prop-input-group" style="flex:1;"><input type="number" id="phys-mass" value="${p.mass}" step="0.1" min="0.001" class="insp-input"></div></div>
        <div class="prop-row"><div class="prop-label">Restitution</div>
          <input type="range" id="phys-rest" min="0" max="1" step="0.01" value="${p.restitution}" style="flex:1;">
          <span id="phys-rest-v" style="width:30px;font-size:10px;">${p.restitution.toFixed(2)}</span></div>
        <div class="prop-row"><div class="prop-label">Friction</div>
          <input type="range" id="phys-fric" min="0" max="2" step="0.01" value="${p.friction}" style="flex:1;">
          <span id="phys-fric-v" style="width:30px;font-size:10px;">${p.friction.toFixed(2)}</span></div>
        <div class="prop-row"><div class="prop-label">Gravity ×</div>
          <div class="prop-input-group" style="flex:1;"><input type="number" id="phys-grav" value="${p.gravityScale}" step="0.1" class="insp-input"></div></div>
        <div class="prop-row"><div class="prop-label">Lin Damp</div>
          <div class="prop-input-group" style="flex:1;"><input type="number" id="phys-ldamp" value="${p.linearDamping}" step="0.01" min="0" class="insp-input"></div></div>
        <div class="prop-row"><div class="prop-label">Shape</div>
          <select id="phys-shape" class="overlay-select" style="flex:1;height:24px;">
            <option value="auto"    ${p.shape==='auto'   ?'selected':''}>Auto-detect</option>
            <option value="box"     ${p.shape==='box'    ?'selected':''}>Box</option>
            <option value="sphere"  ${p.shape==='sphere' ?'selected':''}>Sphere</option>
            <option value="capsule" ${p.shape==='capsule'?'selected':''}>Capsule</option>
            <option value="cylinder"${p.shape==='cylinder'?'selected':''}>Cylinder</option>
          </select></div>
        <div class="prop-row"><div class="prop-label">Is Trigger</div>
          <input type="checkbox" id="phys-trig" ${p.isTrigger?'checked':''} style="cursor:pointer;">
          <span style="font-size:10px;color:var(--text-inactive);margin-left:6px;">No collision response</span></div>
      </div>
    </div>`;

    const enableCb = sec.querySelector('#phys-enabled');
    const opts     = sec.querySelector('#phys-opts');
    enableCb.onchange = () => {
        p.enabled = enableCb.checked;
        opts.style.display = p.enabled ? 'block' : 'none';
        buildDynamicInspector(obj);
        recordHistory(`Rigidbody ${p.enabled?'on':'off'}: ${obj.name}`);
    };
    const bind = (id, key, parse) => {
        const el = sec.querySelector('#'+id); if(!el) return;
        el.oninput = el.onchange = () => {
            const v = el.type==='checkbox' ? el.checked : (parse ? parse(el.value) : parseFloat(el.value));
            p[key] = v;
            const vEl = sec.querySelector('#'+id+'-v');
            if (vEl) vEl.innerText = typeof v==='number' ? v.toFixed(2) : v;
        };
    };
    bind('phys-type',  'bodyType',      v=>v);
    bind('phys-mass',  'mass');
    bind('phys-rest',  'restitution');
    bind('phys-fric',  'friction');
    bind('phys-grav',  'gravityScale');
    bind('phys-ldamp', 'linearDamping');
    bind('phys-shape', 'shape',         v=>v);
    bind('phys-trig',  'isTrigger',     ()=>sec.querySelector('#phys-trig').checked);
    return sec;
}

// ── COMPONENTS SECTION ────────────────────────────────────────────────────────
function buildComponentsSection(obj) {
    const sec = document.createElement('details');
    sec.className = 'inspector-section';
    sec.open = true;
    sec.innerHTML = '<summary>Components</summary><div class="inspector-content-inner" id="attached-comps"></div>';
    const con = sec.querySelector('#attached-comps');
    obj.components.forEach((comp, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid var(--border-color);';
        row.innerHTML = `<span><i class="fas ${comp.icon||'fa-puzzle-piece'}" style="margin-right:6px;color:var(--accent-color);"></i>${comp.name}</span>
            <button class="small-btn" onclick="removeComponent(${idx})" style="color:#e05252;"><i class="fas fa-times"></i></button>`;
        con.appendChild(row);
    });
    return sec;
}
function removeComponent(idx) {
    if (!selectedObject) return;
    const rem = selectedObject.components.splice(idx,1);
    recordHistory(`Remove component: ${rem[0].name}`);
    buildDynamicInspector(selectedObject);
}

// ── Tags ──────────────────────────────────────────────────────────────────────
let globalTags = [];
function updateTagsInspector() {}    // placeholder — used by app.js
