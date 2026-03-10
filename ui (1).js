/**
 * ui.js — Hierarchy, bottom tabs, toolbar, context menu, inspector bindings
 */

let hierarchyExpanded = {};
let draggedId = null;

function updateHierarchyUI() {
    const list = document.getElementById('hierarchy-list');
    if (!list) return;
    list.innerHTML = '';
    const roots = engineObjects.filter(o => !o.parentId);
    roots.forEach(o => renderHierarchyItem(list, o, 0));
}

function renderHierarchyItem(container, obj, depth) {
    const hasChildren = obj.children?.length > 0;
    const expanded    = hierarchyExpanded[obj.id] !== false;
    const isSelected  = selectedObject?.id === obj.id;
    const isMulti     = typeof multiSelected !== 'undefined' && multiSelected.has(obj.id);
    const isMainCam   = obj.id === mainCameraId;

    const item = document.createElement('div');
    item.className = `hierarchy-item${isSelected?' selected':''}${isMulti&&!isSelected?' multi-selected':''}`;
    item.style.paddingLeft = (16 + depth * 14) + 'px';
    item.setAttribute('draggable', 'true');
    item.dataset.id = obj.id;

    const icon  = getTypeIcon(obj.type);
    const hasSc = !!(obj.script?.trim());
    const hasPh = !!(obj.physics?.enabled);

    item.innerHTML = `
        <span class="hierarchy-toggle">${hasChildren?(expanded?'▾':'▸'):''}</span>
        <i class="fas ${icon}" style="width:12px;text-align:center;font-size:10px;flex-shrink:0;opacity:.8;"></i>
        <span class="hi-label">${obj.name}</span>
        ${hasSc ? '<span class="hi-script-dot" title="Has script"></span>' : ''}
        ${hasPh ? '<span class="hi-physics-dot" title="Has physics"></span>' : ''}
        ${isMainCam ? '<span class="hi-main-cam" title="Main Camera">◉</span>' : ''}
        <span class="hi-type">${obj.type}</span>`;

    item.onclick = (e) => {
        if (e.shiftKey && typeof handlePointerDownMulti === 'function') {
            if (selectedObject && !multiSelected.has(selectedObject.id)) multiSelectAdd(selectedObject);
            multiSelectToggle(obj);
            return;
        }
        if (typeof clearMultiSelect === 'function' && multiSelected?.size > 0) clearMultiSelect();
        selectObject(obj);
    };

    item.querySelector('.hierarchy-toggle').onclick = e => {
        e.stopPropagation();
        hierarchyExpanded[obj.id] = !expanded;
        updateHierarchyUI();
    };

    item.addEventListener('dragstart', e => { draggedId = obj.id; e.dataTransfer.effectAllowed = 'move'; });
    item.addEventListener('dragover',  e => { e.preventDefault(); item.classList.add('drop-target'); });
    item.addEventListener('dragleave', () => item.classList.remove('drop-target'));
    item.addEventListener('drop', e => {
        e.preventDefault(); item.classList.remove('drop-target');
        if (draggedId && draggedId !== obj.id) setParent(draggedId, obj.id);
        draggedId = null;
    });

    container.appendChild(item);
    if (hasChildren && expanded) {
        obj.children.forEach(cid => {
            const child = engineObjects.find(o => o.id === cid);
            if (child) renderHierarchyItem(container, child, depth + 1);
        });
    }
}

function getTypeIcon(type) {
    const map = {
        Cube:'fa-cube', Sphere:'fa-circle', Plane:'fa-square', Cylinder:'fa-database',
        Cone:'fa-triangle', Torus:'fa-ring', Ring:'fa-ring', Icosphere:'fa-gem',
        TorusKnot:'fa-infinity', Capsule:'fa-capsules',
        DirectionalLight:'fa-sun', PointLight:'fa-lightbulb', SpotLight:'fa-bullseye',
        HemisphereLight:'fa-circle-half-stroke', AreaLight:'fa-rectangle-xmark',
        VolumetricLight:'fa-star', Particles:'fa-snowflake',
        Camera:'fa-video', Empty:'fa-box-open',
    };
    return map[type] || 'fa-cube';
}

// ── Context Menu ──────────────────────────────────────────────────────────────
function initContextMenu() {
    const ctx   = document.getElementById('hierarchy-context');
    const panel = document.getElementById('panel-left');
    panel.addEventListener('contextmenu', e => {
        e.preventDefault();
        ctx.style.left = e.pageX + 'px';
        ctx.style.top  = e.pageY + 'px';
        ctx.classList.add('active');
    });
    document.addEventListener('click', e => {
        if (!ctx.contains(e.target)) ctx.classList.remove('active');
    });
}

// ── Bottom Tabs ───────────────────────────────────────────────────────────────
function initBottomTabs() {
    document.querySelectorAll('#bottom-tabs .panel-tab').forEach(tab => {
        tab.addEventListener('click', e => {
            document.querySelectorAll('#bottom-tabs .panel-tab').forEach(t => t.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const target = e.currentTarget.dataset.target;
            document.querySelectorAll('#panel-bottom .panel-content > div').forEach(d => d.classList.add('hidden'));
            document.getElementById(target)?.classList.remove('hidden');
        });
    });
}

// ── Toolbar Tools ─────────────────────────────────────────────────────────────
function initToolbarTools() {
    ['move','rotate','scale'].forEach(tool => {
        const btn = document.getElementById(`tool-${tool}`);
        if (!btn) return;
        btn.addEventListener('click', () => {
            document.querySelectorAll('#transform-tools .tool-btn').forEach(b=>b.classList.remove('active'));
            btn.classList.add('active');
            transformControls.setMode(tool==='move'?'translate':tool);
        });
    });

    document.getElementById('tool-select')?.addEventListener('click', () => {
        document.querySelectorAll('#transform-tools .tool-btn').forEach(b=>b.classList.remove('active'));
        document.getElementById('tool-select').classList.add('active');
        transformControls.detach();
    });

    document.getElementById('toggle-grid')?.addEventListener('click', e => {
        e.currentTarget.classList.toggle('active');
        gridHelper.visible = e.currentTarget.classList.contains('active');
    });
    document.getElementById('toggle-snap')?.addEventListener('click', () => toggleSnapping());
    document.getElementById('btn-focus')?.addEventListener('click', () => focusSelected());
    document.getElementById('btn-undo')?.addEventListener('click', () => undoAction());
    document.getElementById('btn-redo')?.addEventListener('click', () => redoAction());
    document.getElementById('btn-duplicate')?.addEventListener('click', () => duplicateSelected());
    document.getElementById('btn-delete')?.addEventListener('click', () => {
        if (typeof deleteMultiSelected==='function' && multiSelected?.size>1) deleteMultiSelected();
        else deleteSelected();
    });
}

// ── Inspector Name ────────────────────────────────────────────────────────────
function initInspectorBindings() {
    document.getElementById('insp-name')?.addEventListener('change', e => {
        if (!selectedObject) return;
        selectedObject.name = e.target.value;
        selectedObject.object.name = e.target.value;
        recordHistory(`Rename to ${e.target.value}`);
        updateHierarchyUI();
    });
    ['pos','rot','scl'].forEach(t => {
        ['x','y','z'].forEach(a => {
            const el = document.getElementById(`${t}-${a}`);
            if (!el) return;
            el.addEventListener('input', applyInspectorToObject);
            el.addEventListener('blur', () => { if (selectedObject) recordHistory(`Transform ${selectedObject.name}`); });
            el.addEventListener('keydown', e => { if (e.key==='Enter') el.blur(); });
        });
    });
}

// ── Master UI Init ────────────────────────────────────────────────────────────
function initUI() {
    initToolbarTools();
    initContextMenu();
    initBottomTabs();
    initInspectorBindings();
    initQuadToggle();
    initGizmoToggle();
    updateUndoRedoBtns();
    if (typeof renderComponentList === 'function') renderComponentList();
    if (typeof updatePrefabUI === 'function') updatePrefabUI();
    logConsole('UI ready.', 'info');
}
