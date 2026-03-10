/**
 * shortcuts.js — Global keyboard shortcuts
 *
 * PLAY MODE GUARD: while a scene is playing, almost all editor shortcuts
 * are suppressed so that game scripts can freely use WASD, E, R, F, G,
 * Delete, etc. without triggering editor actions.
 *
 * Shortcuts that still work during play:
 *   Ctrl+P  → stop scene
 *   Ctrl+.  → stop scene
 *   Escape  → close open modals (script editor etc.)
 */
function initShortcuts() {
    document.addEventListener('keydown', e => {
        const tag     = document.activeElement.tagName;
        const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        const overlay = document.querySelector('.modal-overlay.active, .script-editor-overlay.active');

        // ── Always-available: Play / Stop (regardless of play state or input focus) ──
        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'p') { e.preventDefault(); isPlaying ? stopScene() : playScene(); return; }
            if (e.key === '.') { e.preventDefault(); stopScene(); return; }
        }

        // ── Escape always closes modals / stops play ──────────────────────────────
        if (e.key === 'Escape' && !inInput) {
            document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
            document.querySelectorAll('.script-editor-overlay.active').forEach(m => m.classList.remove('active'));
            // In play mode Escape stops the scene; in editor mode deselects
            if (isPlaying) { stopScene(); return; }
            if (typeof clearMultiSelect === 'function') clearMultiSelect();
            selectObject(null);
            return;
        }

        // ════════════════════════════════════════════════════════════════════════
        // PLAY MODE: block ALL remaining editor shortcuts so game scripts can use
        // W / E / R / A / S / D / F / G / Delete / Ctrl+Z etc. freely.
        // ════════════════════════════════════════════════════════════════════════
        if (isPlaying) return;

        // ── Ctrl/Cmd shortcuts (editor-only) ─────────────────────────────────────
        if (e.ctrlKey || e.metaKey) {
            if (!e.shiftKey && e.key === 'z') { e.preventDefault(); undoAction(); return; }
            if (e.key === 'y' || (e.shiftKey && e.key === 'Z')) { e.preventDefault(); redoAction(); return; }
            if (e.key === 's') { e.preventDefault(); saveScene(); return; }
            if (e.key === 'd') {
                e.preventDefault();
                if (typeof duplicateMultiSelected === 'function' && multiSelected?.size > 1) duplicateMultiSelected();
                else duplicateSelected();
                return;
            }
            if (e.key === 'a') { e.preventDefault(); selectAll(); return; }
            if (e.key === 'e') { e.preventDefault(); openScriptEditorForSelected(); return; }
            if (e.key === 'h') { e.preventDefault(); openModal('modal-history'); return; }
        }

        // ── Single-key editor shortcuts (skip when typing in an input or modal open) ──
        if (inInput || overlay) return;

        switch (e.key) {
            case 'w': case 'W': activateTool('move',   'translate'); break;
            case 'e': case 'E': activateTool('rotate',  'rotate');   break;
            case 'r': case 'R': activateTool('scale',   'scale');    break;
            case 'q': case 'Q':
                document.querySelectorAll('#transform-tools .tool-btn').forEach(b => b.classList.remove('active'));
                document.getElementById('tool-select')?.classList.add('active');
                transformControls.detach();
                break;
            case 'f': case 'F': focusSelected(); break;
            case 'g': case 'G':
                if (typeof groupMultiSelected === 'function') groupMultiSelected();
                break;
            case 'Delete': case 'Backspace':
                if (typeof deleteMultiSelected === 'function' && multiSelected?.size > 1) deleteMultiSelected();
                else deleteSelected();
                break;
            // Shift held = toggle snap temporarily
            case 'Shift': if (!snapEnabled) toggleSnapping(); break;
        }
    });

    document.addEventListener('keyup', e => {
        if (e.key === 'Shift' && snapEnabled) toggleSnapping();
    });
}

function activateTool(btnSuffix, mode) {
    document.querySelectorAll('#transform-tools .tool-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`tool-${btnSuffix}`);
    if (btn) btn.classList.add('active');
    if (selectedObject) transformControls.attach(selectedObject.object);
    transformControls.setMode(mode);
}
