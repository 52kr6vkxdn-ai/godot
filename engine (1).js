/**
 * engine.js — Three.js core engine
 * Upgraded: ACESFilmic tone-map, PMREMGenerator, HDR env map,
 *           volumetric god-ray light, main camera system,
 *           shadow map type (PCFSoft), multi-camera support.
 */

// ── Core state ────────────────────────────────────────────────────────────────
let scene, camera, renderer, orbitControls, transformControls;
let gridHelper, ambientLight;
let engineObjects = [];   // { id, name, object, type, parentId, children[], components[], script, physics, tags, scriptData }
let selectedObject = null;
let mainCameraId   = null;  // engineObject id of the "Main Camera"
let snapEnabled    = false;
const SNAP_TRANSLATE = 0.5;
const SNAP_ROTATE    = 15;
const SNAP_SCALE     = 0.25;
const raycaster = new THREE.Raycaster();
const mouse     = new THREE.Vector2();
let quadMode    = false;
let camTop, camFront, camSide;
let rendererTop, rendererFront, rendererSide;
let frameCount = 0, lastTime = performance.now(), currentFps = 60;

// Environment / lighting
let envPMREM    = null;   // PMREMGenerator
let envTexture  = null;   // current env texture
let godRayMesh  = null;   // volumetric cone mesh

// ── Init ─────────────────────────────────────────────────────────────────────
function initThree() {
    const container = document.getElementById('canvas-container');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1e);
    scene.fog = new THREE.FogExp2(0x1a1a1e, 0.008);

    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(6, 5, 9);
    camera.lookAt(0,0,0);

    // Upgraded renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputEncoding    = THREE.sRGBEncoding;
    renderer.physicallyCorrectLights = true;
    container.appendChild(renderer.domElement);

    // PMREM generator for env maps
    envPMREM = new THREE.PMREMGenerator(renderer);
    envPMREM.compileEquirectangularShader();

    orbitControls = new THREE.OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.07;

    transformControls = new THREE.TransformControls(camera, renderer.domElement);
    transformControls.addEventListener('dragging-changed', e => {
        orbitControls.enabled = !e.value;
        if (!e.value && selectedObject) recordHistory(`Transform ${selectedObject.name}`);
    });
    transformControls.addEventListener('change', () => {
        if (snapEnabled && selectedObject) applySnap();
        updateInspectorFromObject();
    });
    scene.add(transformControls);

    gridHelper = new THREE.GridHelper(30, 30, 0x3a3a3a, 0x2a2a2a);
    scene.add(gridHelper);

    ambientLight = new THREE.AmbientLight(0x404050, 0.4);
    scene.add(ambientLight);

    // Default scene objects
    createEngineObject('Directional Light', 'DirectionalLight', false);
    createEngineObject('Main Camera', 'Camera', false);

    // Set the first Camera as main
    const camEntry = engineObjects.find(o => o.type === 'Camera');
    if (camEntry) mainCameraId = camEntry.id;

    const ro = new ResizeObserver(() => resizeMainRenderer());
    ro.observe(container);
    renderer.domElement.addEventListener('mousedown', onPointerDown);

    logConsole('Engine v0.5 initialized — physically correct lighting, ACESFilmic.', 'success');
}

function resizeMainRenderer() {
    const container = document.getElementById('canvas-container');
    if (!container) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    if (composer) composer.setSize(container.clientWidth, container.clientHeight);
}

// ── Object Factory ────────────────────────────────────────────────────────────
function createEngineObject(name, type, addToHistory = true, parentId = null) {
    let obj, helper;

    switch (type) {
        case 'Cube':
            obj = new THREE.Mesh(new THREE.BoxGeometry(),
                new THREE.MeshStandardMaterial({ color:0xcccccc, roughness:0.7, metalness:0.1 }));
            obj.castShadow = obj.receiveShadow = true; break;
        case 'Sphere':
            obj = new THREE.Mesh(new THREE.SphereGeometry(0.5,32,16),
                new THREE.MeshStandardMaterial({ color:0xcccccc, roughness:0.7, metalness:0.1 }));
            obj.castShadow = obj.receiveShadow = true; break;
        case 'Plane':
            obj = new THREE.Mesh(new THREE.PlaneGeometry(5,5),
                new THREE.MeshStandardMaterial({ color:0xaaaaaa, roughness:0.9, side:THREE.DoubleSide }));
            obj.rotation.x = -Math.PI/2; obj.receiveShadow = true; break;
        case 'Cylinder':
            obj = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,1,32),
                new THREE.MeshStandardMaterial({ color:0xcccccc, roughness:0.7, metalness:0.1 }));
            obj.castShadow = obj.receiveShadow = true; break;
        case 'Cone':
            obj = new THREE.Mesh(new THREE.ConeGeometry(0.5,1,32),
                new THREE.MeshStandardMaterial({ color:0xcccccc, roughness:0.7, metalness:0.1 }));
            obj.castShadow = obj.receiveShadow = true; break;
        case 'Icosphere':
            obj = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6,1),
                new THREE.MeshStandardMaterial({ color:0xcccccc, roughness:0.5, metalness:0.2 }));
            obj.castShadow = obj.receiveShadow = true; break;
        case 'Ring':
            obj = new THREE.Mesh(new THREE.RingGeometry(0.3,0.7,32),
                new THREE.MeshStandardMaterial({ color:0xcccccc, roughness:0.7, side:THREE.DoubleSide }));
            obj.rotation.x = -Math.PI/2; break;
        case 'Torus':
            obj = new THREE.Mesh(new THREE.TorusGeometry(0.5,0.2,16,48),
                new THREE.MeshStandardMaterial({ color:0xcccccc, roughness:0.7, metalness:0.1 }));
            obj.castShadow = obj.receiveShadow = true; break;
        case 'TorusKnot':
            obj = new THREE.Mesh(new THREE.TorusKnotGeometry(0.4,0.12,100,16),
                new THREE.MeshStandardMaterial({ color:0xcccccc, roughness:0.4, metalness:0.3 }));
            obj.castShadow = obj.receiveShadow = true; break;
        case 'Capsule':
            obj = new THREE.Mesh(buildCapsuleGeo(0.3, 0.7),
                new THREE.MeshStandardMaterial({ color:0xcccccc, roughness:0.6, metalness:0.1 }));
            obj.castShadow = obj.receiveShadow = true; break;

        // ── Lights ──────────────────────────────────────────────────────────
        case 'DirectionalLight': {
            obj = new THREE.DirectionalLight(0xfff5e0, 1.2);
            obj.position.set(5, 10, 5);
            obj.castShadow = true;
            obj.shadow.mapSize.set(2048, 2048);
            obj.shadow.camera.near = 0.5; obj.shadow.camera.far = 200;
            obj.shadow.camera.left = -20; obj.shadow.camera.right = 20;
            obj.shadow.camera.top  = 20;  obj.shadow.camera.bottom = -20;
            obj.shadow.bias = -0.0005;
            helper = new THREE.DirectionalLightHelper(obj, 1);
            scene.add(helper); obj.userData.helper = helper; break;
        }
        case 'PointLight': {
            obj = new THREE.PointLight(0xffffff, 1, 20, 2);
            obj.position.set(0, 3, 0);
            obj.castShadow = true;
            obj.shadow.mapSize.set(1024, 1024);
            helper = new THREE.PointLightHelper(obj, 0.4);
            scene.add(helper); obj.userData.helper = helper; break;
        }
        case 'SpotLight': {
            obj = new THREE.SpotLight(0xffffff, 1);
            obj.position.set(2, 5, 2);
            obj.angle = Math.PI / 6;
            obj.penumbra = 0.2;
            obj.decay = 2;
            obj.castShadow = true;
            obj.shadow.mapSize.set(1024, 1024);
            helper = new THREE.SpotLightHelper(obj);
            scene.add(helper); obj.userData.helper = helper; break;
        }
        case 'HemisphereLight': {
            obj = new THREE.HemisphereLight(0x87ceeb, 0x3a2a1a, 0.6);
            obj.position.set(0,10,0);
            helper = new THREE.HemisphereLightHelper(obj, 1);
            scene.add(helper); obj.userData.helper = helper; break;
        }
        case 'AreaLight': {
            obj = new THREE.RectAreaLight(0xffffff, 2, 4, 4);
            obj.position.set(0, 5, 0);
            obj.lookAt(0, 0, 0);

            // RectAreaLight requires RectAreaLightUniformsLib to render correctly.
            // Load it lazily from the Three.js CDN the first time an AreaLight is created.
            const initAreaLight = (rectLight) => {
                if (window._rectAreaLibReady) {
                    // Already initialised — just add a helper if the class is available
                    if (THREE.RectAreaLightHelper) {
                        const h = new THREE.RectAreaLightHelper(rectLight);
                        scene.add(h);
                        rectLight.userData.helper = h;
                    }
                    return;
                }
                const CDN = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/';
                const loadJs = url => new Promise((res, rej) => {
                    if (document.querySelector(`script[src="${url}"]`)) { res(); return; }
                    const s = document.createElement('script');
                    s.src = url;
                    s.onload = res; s.onerror = rej;
                    document.head.appendChild(s);
                });
                Promise.all([
                    loadJs(CDN + 'lights/RectAreaLightUniformsLib.js'),
                    loadJs(CDN + 'helpers/RectAreaLightHelper.js'),
                ]).then(() => {
                    window._rectAreaLibReady = true;
                    THREE.RectAreaLightUniformsLib.init();
                    logConsole('RectAreaLightUniformsLib initialised — Area Lights now render correctly.', 'success');
                    if (THREE.RectAreaLightHelper) {
                        const h = new THREE.RectAreaLightHelper(rectLight);
                        scene.add(h);
                        rectLight.userData.helper = h;
                    }
                }).catch(() => {
                    logConsole('RectAreaLight helper load failed — light will still work but may look flat.', 'warn');
                });
            };
            initAreaLight(obj);
            break;
        }
        case 'VolumetricLight': {
            // God ray / sun shaft light — SpotLight + visual cone
            obj = new THREE.SpotLight(0xfff5a0, 2);
            obj.position.set(0, 12, 0);
            obj.angle = Math.PI / 8;
            obj.penumbra = 0.3; obj.decay = 1.5;
            obj.castShadow = true;
            obj.shadow.mapSize.set(2048, 2048);
            obj.userData.isVolumetric = true;
            obj.userData.godRayDensity = 0.8;
            obj.userData.godRayWeight  = 0.5;
            obj.userData.godRayExposure= 0.4;
            obj.userData.godRayDecay   = 0.95;
            obj.userData.godRaySamples = 100;
            // Visual cone
            const coneGeo = new THREE.ConeGeometry(3, 10, 16, 1, true);
            const coneMat = new THREE.MeshBasicMaterial({
                color: 0xfff5a0, transparent: true, opacity: 0.07,
                side: THREE.BackSide, depthWrite: false
            });
            const cone = new THREE.Mesh(coneGeo, coneMat);
            cone.position.y = -5;
            obj.add(cone);
            obj.userData.godRayCone = cone;
            helper = new THREE.SpotLightHelper(obj);
            scene.add(helper); obj.userData.helper = helper;
            break;
        }
        case 'Particles': {
            const count = 500;
            const geo = new THREE.BufferGeometry();
            const pos = new Float32Array(count * 3);
            for (let i = 0; i < count*3; i++) pos[i] = (Math.random()-0.5)*4;
            geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
            obj = new THREE.Points(geo, new THREE.PointsMaterial({ color:0x88ccff, size:0.05, sizeAttenuation:true }));
            break;
        }
        case 'Camera': {
            obj = new THREE.PerspectiveCamera(60, 16/9, 0.1, 1000);
            obj.position.set(0, 1, 5);
            helper = new THREE.CameraHelper(obj);
            scene.add(helper); obj.userData.helper = helper;
            break;
        }
        case 'Empty':
        default:
            obj = new THREE.Object3D(); break;
    }

    obj.userData.engineId   = THREE.MathUtils.generateUUID();
    obj.userData.engineType = type;
    obj.name = name;

    if (parentId) {
        const par = engineObjects.find(o => o.id === parentId);
        par ? par.object.add(obj) : scene.add(obj);
    } else {
        scene.add(obj);
    }

    const entry = {
        id: obj.userData.engineId, name, object: obj, type,
        parentId: parentId || null, children: [], components: [],
        script: '', tags: [], scriptData: {},
        physics: defaultPhysicsConfig()
    };

    if (parentId) {
        const par = engineObjects.find(o => o.id === parentId);
        if (par) par.children.push(entry.id);
    }

    engineObjects.push(entry);
    if (addToHistory) recordHistory(`Create ${name}`);
    updateHierarchyUI();
    selectObject(entry);
    updateStatusBar();
    return entry;
}

function buildCapsuleGeo(r, h) {
    const top = new THREE.SphereGeometry(r, 16, 8, 0, Math.PI*2, 0, Math.PI/2);
    const bot = new THREE.SphereGeometry(r, 16, 8, 0, Math.PI*2, Math.PI/2, Math.PI/2);
    const cyl = new THREE.CylinderGeometry(r, r, h, 16, 1);
    top.translate(0,  h/2, 0);
    bot.translate(0, -h/2, 0);
    const geo = THREE.BufferGeometryUtils ? THREE.BufferGeometryUtils.mergeBufferGeometries([top, cyl, bot]) : cyl;
    return geo || cyl;
}

// ── Delete ────────────────────────────────────────────────────────────────────
function deleteSelected() {
    if (!selectedObject) return;
    const id = selectedObject.id;
    const toDelete = collectSubtree(id);
    toDelete.forEach(eid => {
        const e = engineObjects.find(o => o.id === eid);
        if (!e) return;
        if (e.object.userData.helper) scene.remove(e.object.userData.helper);
        if (e.object.parent) e.object.parent.remove(e.object);
        else scene.remove(e.object);
    });
    const par = engineObjects.find(o => o.children.includes(id));
    if (par) par.children = par.children.filter(c => c !== id);
    engineObjects = engineObjects.filter(o => !toDelete.includes(o.id));
    selectObject(null);
    recordHistory(`Delete ${selectedObject ? selectedObject.name : 'object'}`);
    updateHierarchyUI(); updateStatusBar();
}

function collectSubtree(id) {
    const result = [id];
    const e = engineObjects.find(o => o.id === id);
    if (e) e.children.forEach(cid => result.push(...collectSubtree(cid)));
    return result;
}

// ── Duplicate ────────────────────────────────────────────────────────────────
function duplicateSelected() {
    if (!selectedObject) return;
    const src = selectedObject;
    const newEntry = createEngineObject(src.name + ' Copy', src.type, false, src.parentId);
    newEntry.object.position.copy(src.object.position);
    newEntry.object.rotation.copy(src.object.rotation);
    newEntry.object.scale.copy(src.object.scale);
    newEntry.object.position.x += 0.5;
    if (src.object.isMesh && src.object.material) {
        newEntry.object.material = src.object.material.clone();
    }
    newEntry.components = JSON.parse(JSON.stringify(src.components));
    newEntry.script = src.script;
    newEntry.physics = JSON.parse(JSON.stringify(src.physics));
    newEntry.tags = [...(src.tags || [])];
    recordHistory(`Duplicate ${src.name}`);
    updateHierarchyUI();
}

// ── Parenting ─────────────────────────────────────────────────────────────────
function setParent(childId, newParentId) {
    const child  = engineObjects.find(o => o.id === childId);
    const newPar = engineObjects.find(o => o.id === newParentId);
    if (!child || !newPar || childId === newParentId) return;
    if (collectSubtree(childId).includes(newParentId)) return;

    if (child.parentId) {
        const op = engineObjects.find(o => o.id === child.parentId);
        if (op) op.children = op.children.filter(i => i !== childId);
    }
    const wp = new THREE.Vector3();
    child.object.getWorldPosition(wp);
    child.object.parent?.remove(child.object);
    newPar.object.add(child.object);
    const np = new THREE.Vector3();
    newPar.object.getWorldPosition(np);
    child.object.position.copy(wp.sub(np));
    child.parentId = newParentId;
    newPar.children.push(childId);
    recordHistory(`Parent ${child.name} → ${newPar.name}`);
    updateHierarchyUI();
}

// ── Main Camera System ────────────────────────────────────────────────────────
function setMainCamera(entryId) {
    mainCameraId = entryId;
    const entry = engineObjects.find(o => o.id === entryId);
    if (entry && entry.object.isCamera) {
        const cam = entry.object;
        cam.aspect = camera.aspect;
        cam.updateProjectionMatrix();
        logConsole(`Main Camera → "${entry.name}"`, 'success');
    }
    updateHierarchyUI();
    if (selectedObject) buildDynamicInspector(selectedObject);
}

function getActiveRenderCamera() {
    if (!mainCameraId || !isPlaying) return camera;
    const entry = engineObjects.find(o => o.id === mainCameraId);
    if (entry && entry.object.isCamera) {
        const cam = entry.object;
        const container = document.getElementById('canvas-container');
        cam.aspect = container.clientWidth / container.clientHeight;
        cam.updateProjectionMatrix();
        return cam;
    }
    return camera;
}

// ── HDR / Environment ─────────────────────────────────────────────────────────
function loadHDRFromFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Use RGBELoader if available, else fallback equirect
    if (typeof THREE.RGBELoader !== 'undefined') {
        new THREE.RGBELoader().load(url, tex => {
            const env = envPMREM.fromEquirectangular(tex).texture;
            scene.environment = env;
            scene.background  = env;
            tex.dispose(); envTexture = env;
            logConsole(`HDR loaded: ${file.name}`, 'success');
        });
    } else {
        // Fallback: load as equirectangular texture
        const loader = new THREE.TextureLoader();
        loader.load(url, tex => {
            tex.mapping = THREE.EquirectangularReflectionMapping;
            const env = envPMREM.fromEquirectangular(tex).texture;
            scene.environment = env;
            scene.background  = new THREE.Color(0x1a1a1e);
            tex.dispose(); envTexture = env;
            logConsole(`Env map loaded: ${file.name}`, 'info');
        });
    }
}

function loadHDRFromURL(url, name) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        const tex = new THREE.Texture(img);
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.needsUpdate = true;
        const env = envPMREM.fromEquirectangular(tex).texture;
        scene.environment = env;
        tex.dispose();
        logConsole(`Env preset "${name}" applied.`, 'success');
    };
    img.onerror = () => logConsole(`Env preset load failed.`, 'warn');
    img.src = url;
}

function clearEnvironment() {
    scene.environment = null;
    scene.background  = new THREE.Color(0x1a1a1e);
    envTexture = null;
    logConsole('Environment cleared.', 'info');
}

// ── Snapping ──────────────────────────────────────────────────────────────────
function toggleSnapping() {
    snapEnabled = !snapEnabled;
    const btn = document.getElementById('toggle-snap');
    if (btn) btn.classList.toggle('active', snapEnabled);
    const ind = document.getElementById('snap-indicator');
    if (ind) ind.classList.toggle('hidden', !snapEnabled);
    document.getElementById('stat-snap').innerText = `Snap: ${snapEnabled?'ON':'OFF'}`;
    logConsole(`Snapping ${snapEnabled?'enabled':'disabled'}.`, 'info');
}

function applySnap() {
    if (!selectedObject) return;
    const obj  = selectedObject.object;
    const mode = transformControls.getMode();
    if (mode === 'translate') {
        obj.position.x = Math.round(obj.position.x/SNAP_TRANSLATE)*SNAP_TRANSLATE;
        obj.position.y = Math.round(obj.position.y/SNAP_TRANSLATE)*SNAP_TRANSLATE;
        obj.position.z = Math.round(obj.position.z/SNAP_TRANSLATE)*SNAP_TRANSLATE;
    } else if (mode === 'rotate') {
        const s = THREE.MathUtils.degToRad(SNAP_ROTATE);
        obj.rotation.x = Math.round(obj.rotation.x/s)*s;
        obj.rotation.y = Math.round(obj.rotation.y/s)*s;
        obj.rotation.z = Math.round(obj.rotation.z/s)*s;
    } else if (mode === 'scale') {
        obj.scale.x = Math.round(obj.scale.x/SNAP_SCALE)*SNAP_SCALE;
        obj.scale.y = Math.round(obj.scale.y/SNAP_SCALE)*SNAP_SCALE;
        obj.scale.z = Math.round(obj.scale.z/SNAP_SCALE)*SNAP_SCALE;
    }
}

function focusSelected() {
    if (!selectedObject) return;
    const pos = new THREE.Vector3();
    selectedObject.object.getWorldPosition(pos);
    orbitControls.target.copy(pos);
    const off = camera.position.clone().sub(orbitControls.target).normalize().multiplyScalar(4);
    camera.position.copy(pos.clone().add(off));
    orbitControls.update();
}

// ── Raycasting ────────────────────────────────────────────────────────────────
function onPointerDown(event) {
    if (event.button !== 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width)  * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const targets = engineObjects.map(o => o.object.userData.helper || o.object);
    const hits    = raycaster.intersectObjects(targets, true);
    let foundEntry = null;
    if (hits.length > 0) {
        let hit = hits[0].object;
        while (hit.parent && !hit.userData.engineId) {
            if (hit.parent.type?.includes('Helper')) { hit = hit.parent; break; }
            hit = hit.parent;
        }
        foundEntry = engineObjects.find(o =>
            o.object.userData.engineId === hit.userData.engineId ||
            (o.object.userData.helper && o.object.userData.helper === hit)
        ) || null;
    }

    if (typeof handlePointerDownMulti === 'function') {
        if (handlePointerDownMulti(event, foundEntry)) return;
    }
    if (foundEntry) { selectObject(foundEntry); return; }
    if (!transformControls.dragging) selectObject(null);
}

// ── Render Loop ───────────────────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);
    frameCount++;
    const now = performance.now();
    const dt  = Math.min((now - (animate._last || now)) / 1000, 0.1);
    animate._last = now;

    if (now - lastTime >= 1000) {
        currentFps = frameCount; frameCount = 0; lastTime = now;
        document.getElementById('stat-fps').innerText = `FPS: ${currentFps}`;
        updateStatusBar();
    }

    // Only update orbit controls when not playing (or when paused)
    if (!isPlaying || isPaused) orbitControls.update();

    if (isPlaying) tickScripts();
    if (isPlaying && typeof stepPhysics === 'function') stepPhysics(dt);

    // Update helpers (only in editor / pause mode — hidden during play)
    if (!isPlaying || isPaused) {
        engineObjects.forEach(o => {
            if (o.object.userData.helper?.update) o.object.userData.helper.update();
            // Animate god ray cone opacity
            if (o.object.userData.isVolumetric && o.object.userData.godRayCone) {
                o.object.userData.godRayCone.material.opacity =
                    0.05 + 0.03 * Math.sin(now * 0.001);
            }
        });
    }

    const activeCam = getActiveRenderCamera();

    if (typeof renderWithFX === 'function') {
        renderWithFX(activeCam);
    } else {
        renderer.render(scene, activeCam);
    }
    if (quadMode) renderQuadViews();
    if (!isPlaying || isPaused) drawGizmo();
    if (typeof drawSceneStats === 'function') drawSceneStats();
}

// ── Scene save / load ─────────────────────────────────────────────────────────
function saveScene() {
    const data = {
        version: '0.5',
        objects: engineObjects.map(o => ({
            id: o.id, name: o.name, type: o.type,
            parentId: o.parentId, components: o.components,
            position: o.object.position.toArray(),
            rotation: [o.object.rotation.x, o.object.rotation.y, o.object.rotation.z],
            scale:    o.object.scale.toArray(),
            color:    (o.object.isMesh && o.object.material?.color) ? '#'+o.object.material.color.getHexString() : null,
            roughness: o.object.isMesh ? o.object.material?.roughness : null,
            metalness: o.object.isMesh ? o.object.material?.metalness : null,
            script:   o.script || '',
            physics:  o.physics || null,
            tags:     o.tags || [],
            isMainCamera: o.id === mainCameraId,
        }))
    };
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'scene.json'; a.click();
    logConsole('Scene saved.', 'success');
}

function newScene() {
    if (!confirm('Clear scene? Unsaved changes will be lost.')) return;
    if (isPlaying) stopScene();
    engineObjects.slice().forEach(o => {
        if (o.object.userData.helper) scene.remove(o.object.userData.helper);
        if (o.object.parent) o.object.parent.remove(o.object); else scene.remove(o.object);
    });
    engineObjects = []; historyStack = []; historyIndex = -1; mainCameraId = null;
    selectObject(null); updateHierarchyUI(); updateStatusBar();
    logConsole('New scene created.', 'info');
}

function handleLoadFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            if (!confirm('Load scene? Current scene will be cleared.')) return;
            newScene();
            (data.objects||[]).forEach(o => {
                const entry = createEngineObject(o.name, o.type, false, null);
                entry.object.position.fromArray(o.position||[0,0,0]);
                entry.object.rotation.set(...(o.rotation||[0,0,0]));
                entry.object.scale.fromArray(o.scale||[1,1,1]);
                if (o.color && entry.object.isMesh) {
                    entry.object.material.color.set(o.color);
                    if (o.roughness!=null) entry.object.material.roughness = o.roughness;
                    if (o.metalness!=null) entry.object.material.metalness = o.metalness;
                }
                entry.components = o.components||[];
                entry.script = o.script||'';
                if (o.physics) entry.physics = o.physics;
                if (o.tags) entry.tags = o.tags;
                if (o.isMainCamera) mainCameraId = entry.id;
            });
            logConsole(`Scene loaded: ${file.name}`, 'success');
        } catch(err) { logConsole(`Load failed: ${err.message}`, 'error'); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ── Status bar ────────────────────────────────────────────────────────────────
function updateStatusBar() {
    const sc = engineObjects.filter(o=>o.script?.trim()).length;
    const pc = engineObjects.filter(o=>o.physics?.enabled).length;
    document.getElementById('stat-objects').innerText = `Objects: ${engineObjects.length}`;
    const ss = document.getElementById('stat-scripts');
    if (ss) ss.innerText = `Scripts: ${sc}`;
    const sp = document.getElementById('stat-physics');
    if (sp) sp.innerText = `Physics: ${pc}`;
    document.getElementById('stat-mem').innerText = `Mem: ${(110 + engineObjects.length*2.5).toFixed(0)}MB`;
}

function logConsole(msg, level='info') {
    const out = document.getElementById('tab-console'); if (!out) return;
    const time = new Date().toLocaleTimeString('en',{hour12:false});
    out.innerHTML += `<span class="log-${level}">[${time}] ${msg}</span><br>`;
    out.scrollTop = out.scrollHeight;
}
