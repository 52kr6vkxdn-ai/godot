/**
 * app.js — Master init, scene helpers, GI, stats, tag manager, scene settings
 */

let statsOverlayVisible = false;

// ── App Init ──────────────────────────────────────────────────────────────────
function initApp() {
    initThree();
    initQuadViews();
    initScriptInput();
    initScriptEditor();
    initUI();
    initResizers();
    initShortcuts();
    initMultiSelect();
    renderSnippets();
    buildAPIReference();
    renderScriptLibraryUI();
    // PostFX async load
    initPostFX().catch(() => {});
    recordHistory('Scene opened');
    animate();
    logConsole('Forge3D v0.5 — Physically correct renderer, Cannon-ES physics, CodeMirror editor.', 'success');
    logConsole('Shift+click → multi-select  |  G → group  |  No selection → Scene Properties', 'info');
}

// ── Script library modal open ─────────────────────────────────────────────────
function openScriptLibraryModal() {
    renderScriptLibraryUI();
    openModal('modal-script-library');
}

// ── Clear console ─────────────────────────────────────────────────────────────
function clearConsole() {
    const el = document.getElementById('tab-console');
    if (el) el.innerHTML = '<span class="log-info">Console cleared.</span><br>';
}

// ── Select all ────────────────────────────────────────────────────────────────
function selectAll() { if (typeof selectAllObjects==='function') selectAllObjects(); }

// ── Script editor for selected ────────────────────────────────────────────────
function openScriptEditorForSelected() {
    if (!selectedObject) { logConsole('No object selected.','warn'); return; }
    openScriptEditor(selectedObject);
}

// ── Stats overlay ─────────────────────────────────────────────────────────────
function toggleStatsOverlay() {
    statsOverlayVisible = !statsOverlayVisible;
    const c = document.getElementById('stats-overlay-canvas');
    if (c) c.classList.toggle('hidden', !statsOverlayVisible);
}

function drawSceneStats() {
    if (!statsOverlayVisible) return;
    const canvas = document.getElementById('stats-overlay-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 11px monospace';

    const info = renderer.info;
    const lines = [
        `FPS: ${currentFps}`,
        `Draw calls: ${info.render?.calls||0}`,
        `Triangles: ${(info.render?.triangles||0).toLocaleString()}`,
        `Geometries: ${info.memory?.geometries||0}`,
        `Textures: ${info.memory?.textures||0}`,
        `Objects: ${engineObjects.length}`,
        `Scripts: ${Object.keys(scriptInstances||{}).length}`,
        `Physics: ${Object.keys(physicsBodies||{}).length} bodies`,
        isPlaying ? '▶ PLAYING' : '⏹ EDITOR',
    ];
    lines.forEach((l,i) => ctx.fillText(l, 8, 16+i*14));
}

// ── Tag system ────────────────────────────────────────────────────────────────
function updateTagsInspector() {
    const row = document.getElementById('insp-tags-row');
    if (!row || !selectedObject) return;
    const tags = selectedObject.tags || [];
    row.innerHTML = tags.map((t,i) => `
        <span class="tag-chip">${t}<button onclick="removeTagFromSelected(${i})" style="margin-left:3px;background:none;border:none;color:inherit;cursor:pointer;padding:0;">×</button></span>
    `).join('') + `<button class="snippet-btn" style="height:18px;padding:0 6px;font-size:10px;" onclick="promptAddTag()">+ tag</button>`;
}
function promptAddTag() {
    const t = prompt('Tag name:'); if (!t?.trim()) return;
    if (!selectedObject.tags) selectedObject.tags=[];
    if (!selectedObject.tags.includes(t.trim())) selectedObject.tags.push(t.trim());
    updateTagsInspector();
}
function removeTagFromSelected(idx) {
    if (!selectedObject) return;
    selectedObject.tags?.splice(idx,1);
    updateTagsInspector();
}

// ── Export scripts ────────────────────────────────────────────────────────────
function exportScripts() {
    const scripts = engineObjects.filter(o=>o.script?.trim()).map(o =>
        `// === ${o.name} (${o.type}) ===\n${o.script}`
    ).join('\n\n');
    if (!scripts) { logConsole('No scripts to export.','warn'); return; }
    const blob = new Blob([scripts], {type:'text/javascript'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'scripts.js'; a.click();
    logConsole('Scripts exported.','success');
}

// ── Ambient / Fog shortcuts (used by scene settings in inspector) ─────────────
function updateAmbient() {
    const c = document.getElementById('scene-ambient-color')?.value;
    const i = parseFloat(document.getElementById('scene-ambient-int')?.value)||0.4;
    if (ambientLight && c) { ambientLight.color.set(c); ambientLight.intensity=i; }
}
function toggleSceneFog(on) {
    if (on) {
        const color   = document.getElementById('fog-color')?.value||'#1a1a1e';
        const density = parseFloat(document.getElementById('fog-density')?.value)||0.008;
        scene.fog = new THREE.FogExp2(color, density);
    } else { scene.fog = null; }
}
function updateFog() {
    const on = document.getElementById('fog-enabled')?.checked; if (!on) return;
    const color   = document.getElementById('fog-color')?.value||'#1a1a1e';
    const density = parseFloat(document.getElementById('fog-density')?.value)||0.008;
    scene.fog = new THREE.FogExp2(color, density);
}
function updateGrid() {
    const size = parseInt(document.getElementById('scene-grid-size')?.value)||30;
    if (gridHelper) { scene.remove(gridHelper); }
    gridHelper = new THREE.GridHelper(size, size, 0x3a3a3a, 0x2a2a2a);
    scene.add(gridHelper);
}
function applyGIBounces(n) {
    const hints=['No GI.','Single bounce — subtle fill.','2 bounces — balanced.','Soft indirect light.',
        'High GI — rich indirect.','Very high — Blender-like.','Ultra — deep GI.','Extreme.','Maximum.'];
    const el = document.getElementById('scene-gi-hint'); if (el) el.innerText = hints[n]||'';
    if (ambientLight) ambientLight.intensity = Math.min(0.4 + n*0.18, 2.0);
    renderer.toneMappingExposure = Math.min(1 + n*0.04, 1.5);
    const expEl = document.getElementById('scene-exposure'); if (expEl) expEl.value = renderer.toneMappingExposure.toFixed(2);
}
