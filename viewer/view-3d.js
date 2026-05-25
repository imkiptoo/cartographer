// ===== 3D viewer =====
// Three.js sphere-and-cylinder rendering of the same data Cart core holds.

(function () {
  const S = Cart.state;

  // DOM
  const canvasEl = document.getElementById('canvas-3d');
  const labelsLayer = document.getElementById('labels-3d');
  const gizmoCanvasEl = document.getElementById('gizmo-canvas');

  // Three.js objects
  let scene, camera, renderer, controls, raycaster;
  const mouse = new THREE.Vector2();
  const nodeMeshes = new Map();
  const nodeLabels = new Map();
  let edgeObjects = [];

  // Force sim state
  let simulationRunning = false;
  let temperature = 1.0;
  let frameCount = 0;
  let autoFitPending = false;
  let autoRotate = false;

  const REPULSION = 15000;
  const SPRING_LEN = 60;
  const SPRING_K = 0.012;
  const CLUSTER_K = 0.025;
  const CENTER_K = 0.0008;
  const MIN_DIST = 14;
  const DAMPING = 0.85;
  const MAX_SPEED = 8;
  const VOLUME = 280;

  // Shared edge geometries
  const EDGE_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  EDGE_GEOMETRY.translate(0, 0.5, 0);
  const ARROW_GEOMETRY = new THREE.ConeGeometry(1, 1, 14);
  ARROW_GEOMETRY.translate(0, -0.5, 0);
  const PIPE_RADIUS_PUSH = 0.6;
  const PIPE_RADIUS_EMBED = 0.35;
  const ARROW_RADIUS_PUSH = 2.0;
  const ARROW_RADIUS_EMBED = 1.4;
  const ARROW_HEIGHT = 4.2;
  const PIPE_COLOR_BASE = 0x6a7689;

  // Camera animation
  let cameraAnimating = false;
  const camTargetPos = new THREE.Vector3();
  const camTargetLook = new THREE.Vector3();

  // Gizmo
  let gizmoScene, gizmoCamera, gizmoRenderer, gizmoCube, gizmoEdges;
  let hoveredGizmoFace = -1;
  const gizmoRaycaster = new THREE.Raycaster();
  const gizmoMouse = new THREE.Vector2();
  const GIZMO_FACE_LABELS = ['RIGHT', 'LEFT', 'TOP', 'BOTTOM', 'FRONT', 'BACK'];

  // Picking gesture detection
  const DRAG_THRESHOLD_PX = 5;
  let pointerDownX = 0, pointerDownY = 0, pointerDragged = false;

  let active = false;
  let initialized = false;
  let rafId = 0;
  let currentTheme = 'dark';
  let groundGrid = null;
  let panMode = false;

  const THEMES = {
    dark:  {
      bg: 0x0d1117, gizmoFill: '#1f2630', gizmoBorder: '#30363d', gizmoText: '#e6edf3',
      gridMain: 0x4a5567, gridSub: 0x2a3340,
    },
    light: {
      bg: 0xf7f8fa, gizmoFill: '#ffffff', gizmoBorder: '#d6dae0', gizmoText: '#1d2025',
      gridMain: 0xa4abb6, gridSub: 0xc8cdd4,
    },
  };

  function initScene() {
    const tc = THEMES[currentTheme];
    scene = new THREE.Scene();
    scene.background = new THREE.Color(tc.bg);
    scene.fog = new THREE.Fog(tc.bg, VOLUME * 1.5, VOLUME * 4);

    const rect = canvasEl.getBoundingClientRect();
    camera = new THREE.PerspectiveCamera(50, rect.width / rect.height, 1, VOLUME * 8);
    camera.position.set(VOLUME * 0.8, VOLUME * 0.5, VOLUME * 1.4);

    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(rect.width || 600, rect.height || 400, false);

    controls = new THREE.OrbitControls(camera, canvasEl);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.7;
    controls.panSpeed = 0.7;
    controls.minDistance = 60;
    controls.maxDistance = VOLUME * 6;

    raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 4;

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.55);
    key.position.set(1, 1, 1); scene.add(key);
    const rim = new THREE.DirectionalLight(0x6688ff, 0.25);
    rim.position.set(-1, -0.5, -1); scene.add(rim);

    // Ground grid — sits at the bottom of the data cube, like Blender's floor.
    groundGrid = new THREE.GridHelper(VOLUME * 2, 24, tc.gridMain, tc.gridSub);
    groundGrid.position.y = -VOLUME;
    groundGrid.material.transparent = true;
    groundGrid.material.opacity = 0.45;
    scene.add(groundGrid);
  }

  function resizeRenderer() {
    if (!renderer) return;
    const rect = canvasEl.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
  }

  function anchorFor(cat) {
    const a2 = S.CLUSTER_ANCHORS[cat];
    const idx = S.CATEGORIES.findIndex(c => c.id === cat);
    const total = Math.max(S.CATEGORIES.length, 1);
    const fz = idx >= 0 ? (idx / (total - 1 || 1)) : 0.5;
    const fx = a2 ? a2.fx : 0.5;
    const fy = a2 ? a2.fy : 0.5;
    return {
      x: (fx - 0.5) * VOLUME,
      y: (0.5 - fy) * VOLUME,
      z: (fz - 0.5) * VOLUME * 0.8,
    };
  }

  function initialiseLayout() {
    const byCat = new Map();
    S.NODES.forEach(n => {
      if (!byCat.has(n.cat)) byCat.set(n.cat, []);
      byCat.get(n.cat).push(n);
    });
    byCat.forEach((nodes, cat) => {
      const a = anchorFor(cat);
      const ringR = 14 + Math.sqrt(nodes.length) * 8;
      nodes.forEach((n, i) => {
        const t = (i / nodes.length) * Math.PI * 2;
        const phi = (i / nodes.length) * Math.PI;
        n.x = a.x + Math.cos(t) * ringR + (Math.random() - 0.5) * 5;
        n.y = a.y + Math.sin(t) * ringR + (Math.random() - 0.5) * 5;
        n.z = a.z + Math.cos(phi) * ringR * 0.5 + (Math.random() - 0.5) * 5;
        n.vx = 0; n.vy = 0; n.vz = 0;
        n.fx3d = 0; n.fy3d = 0; n.fz3d = 0;
        n.fixed = false;
        n.anchorX = a.x; n.anchorY = a.y; n.anchorZ = a.z;
      });
    });
  }

  function clearScene() {
    nodeMeshes.forEach(m => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    nodeMeshes.clear();
    edgeObjects.forEach(o => {
      scene.remove(o.mesh); o.material.dispose();
      scene.remove(o.arrow); o.arrowMaterial.dispose();
    });
    edgeObjects = [];
    nodeLabels.forEach(el => el.remove());
    nodeLabels.clear();
  }

  function renderNodes() {
    S.NODES.forEach(n => {
      const r = (n.size || 7) * 0.6;
      const geom = new THREE.SphereGeometry(r, 24, 18);
      const color = Cart.CAT_COLORS[n.cat] || 0x888888;
      const mat = new THREE.MeshStandardMaterial({
        color, roughness: 0.35, metalness: 0.1, emissive: color, emissiveIntensity: 0.15,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(n.x, n.y, n.z);
      mesh.userData = { id: n.id, baseColor: color, baseR: r };
      scene.add(mesh);
      nodeMeshes.set(n.id, mesh);

      const label = document.createElement('div');
      label.className = 'label-3d';
      label.textContent = n.label;
      label.dataset.id = n.id;
      labelsLayer.appendChild(label);
      nodeLabels.set(n.id, label);
    });
  }

  function renderEdges() {
    S.EDGES.forEach(e => {
      const s = S.nodeById.get(e.src);
      const d = S.nodeById.get(e.dst);
      if (!s || !d) return;
      const pipeMat = new THREE.MeshBasicMaterial({
        color: PIPE_COLOR_BASE, transparent: true,
        opacity: e.type === 'embed' ? 0.55 : 0.85,
      });
      const mesh = new THREE.Mesh(EDGE_GEOMETRY, pipeMat);
      mesh.userData = { src: e.src, dst: e.dst, type: e.type };
      scene.add(mesh);

      const arrowMat = new THREE.MeshBasicMaterial({
        color: PIPE_COLOR_BASE, transparent: true,
        opacity: e.type === 'embed' ? 0.7 : 1.0,
      });
      const arrow = new THREE.Mesh(ARROW_GEOMETRY, arrowMat);
      arrow.userData = { src: e.src, dst: e.dst, type: e.type };
      scene.add(arrow);

      edgeObjects.push({ mesh, arrow, data: e, material: pipeMat, arrowMaterial: arrowMat });
    });
  }

  const _edgeDir = new THREE.Vector3();
  const _edgeUp = new THREE.Vector3(0, 1, 0);
  const _edgeQuat = new THREE.Quaternion();

  function updateMeshesFromSimulation() {
    nodeMeshes.forEach((mesh, id) => {
      const n = S.nodeById.get(id);
      if (!n) return;
      mesh.position.set(n.x, n.y, n.z);
    });
    edgeObjects.forEach(({ mesh, arrow, data }) => {
      const s = S.nodeById.get(data.src);
      const d = S.nodeById.get(data.dst);
      if (!s || !d) return;
      _edgeDir.set(d.x - s.x, d.y - s.y, d.z - s.z);
      const len = _edgeDir.length();
      if (len < 0.001) { mesh.visible = false; arrow.visible = false; return; }
      const dstR = (d.size || 7) * 0.6;
      const pipeEnd = Math.max(len - dstR - ARROW_HEIGHT + 1, 1);
      _edgeDir.normalize();
      _edgeQuat.setFromUnitVectors(_edgeUp, _edgeDir);
      mesh.position.set(s.x, s.y, s.z);
      const r = data.type === 'embed' ? PIPE_RADIUS_EMBED : PIPE_RADIUS_PUSH;
      mesh.scale.set(r, pipeEnd, r);
      mesh.quaternion.copy(_edgeQuat);
      const tipX = d.x - _edgeDir.x * dstR;
      const tipY = d.y - _edgeDir.y * dstR;
      const tipZ = d.z - _edgeDir.z * dstR;
      arrow.position.set(tipX, tipY, tipZ);
      const ar = data.type === 'embed' ? ARROW_RADIUS_EMBED : ARROW_RADIUS_PUSH;
      arrow.scale.set(ar, ARROW_HEIGHT, ar);
      arrow.quaternion.copy(_edgeQuat);
    });
  }

  const projVec = new THREE.Vector3();
  const LABEL_LIFT_PX = 14;
  function updateLabels() {
    const rect = labelsLayer.getBoundingClientRect();
    const halfW = rect.width / 2, halfH = rect.height / 2;
    nodeLabels.forEach((el, id) => {
      const n = S.nodeById.get(id);
      if (!n) { el.style.display = 'none'; return; }
      projVec.set(n.x, n.y, n.z);
      projVec.project(camera);
      if (projVec.z > 1 || projVec.x < -1.3 || projVec.x > 1.3 || projVec.y < -1.3 || projVec.y > 1.3) {
        el.style.display = 'none'; return;
      }
      if (!S.activeCats.has(n.cat)) { el.style.display = 'none'; return; }
      if (!S.showLabels && id !== S.pinnedId && id !== S.hoveredId) {
        el.style.display = 'none'; return;
      }
      el.style.display = '';
      const sx = projVec.x * halfW + halfW;
      const sy = -projVec.y * halfH + halfH - LABEL_LIFT_PX;
      el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
    });
  }

  function step() {
    if (!simulationRunning) return;
    for (const n of S.NODES) { n.fx3d = 0; n.fy3d = 0; n.fz3d = 0; }

    for (let i = 0; i < S.NODES.length; i++) {
      const a = S.NODES[i];
      for (let j = i + 1; j < S.NODES.length; j++) {
        const b = S.NODES[j];
        let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
        let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 0.01) {
          dx = Math.random() - 0.5; dy = Math.random() - 0.5; dz = Math.random() - 0.5;
          d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        }
        let force = REPULSION / (d * d);
        if (d < MIN_DIST) force += (MIN_DIST - d) * 3;
        const ux = dx / d, uy = dy / d, uz = dz / d;
        a.fx3d += ux * force; a.fy3d += uy * force; a.fz3d += uz * force;
        b.fx3d -= ux * force; b.fy3d -= uy * force; b.fz3d -= uz * force;
      }
    }
    for (const n of S.NODES) {
      n.fx3d += (n.anchorX - n.x) * CLUSTER_K;
      n.fy3d += (n.anchorY - n.y) * CLUSTER_K;
      n.fz3d += (n.anchorZ - n.z) * CLUSTER_K;
      n.fx3d += -n.x * CENTER_K;
      n.fy3d += -n.y * CENTER_K;
      n.fz3d += -n.z * CENTER_K;
    }
    for (const e of S.EDGES) {
      const a = S.nodeById.get(e.src);
      const b = S.nodeById.get(e.dst);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const diff = d - SPRING_LEN;
      const force = diff * SPRING_K;
      const fx = (dx / d) * force, fy = (dy / d) * force, fz = (dz / d) * force;
      a.fx3d += fx; a.fy3d += fy; a.fz3d += fz;
      b.fx3d -= fx; b.fy3d -= fy; b.fz3d -= fz;
    }
    let totalMotion = 0;
    const bound = VOLUME * 0.95;
    for (const n of S.NODES) {
      if (n.fixed) { n.vx = 0; n.vy = 0; n.vz = 0; continue; }
      n.vx = (n.vx + n.fx3d * temperature) * DAMPING;
      n.vy = (n.vy + n.fy3d * temperature) * DAMPING;
      n.vz = (n.vz + n.fz3d * temperature) * DAMPING;
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy + n.vz * n.vz);
      if (speed > MAX_SPEED) {
        const k = MAX_SPEED / speed; n.vx *= k; n.vy *= k; n.vz *= k;
      }
      n.x += n.vx; n.y += n.vy; n.z += n.vz;
      totalMotion += Math.abs(n.vx) + Math.abs(n.vy) + Math.abs(n.vz);
      if (n.x < -bound) { n.x = -bound; n.vx *= -0.3; }
      if (n.x > bound)  { n.x =  bound; n.vx *= -0.3; }
      if (n.y < -bound) { n.y = -bound; n.vy *= -0.3; }
      if (n.y > bound)  { n.y =  bound; n.vy *= -0.3; }
      if (n.z < -bound) { n.z = -bound; n.vz *= -0.3; }
      if (n.z > bound)  { n.z =  bound; n.vz *= -0.3; }
    }
    frameCount++;
    if (frameCount > 90) temperature = Math.max(0.08, temperature * 0.992);
    if (totalMotion <= 0.5 && frameCount >= 90) {
      simulationRunning = false;
      if (autoFitPending && !S.pinnedId) {
        autoFitPending = false;
        fitVisibleNodes();
      }
    }
  }

  function reheat() {
    temperature = 1.0;
    frameCount = 0;
    simulationRunning = true;
  }

  // ----- Gizmo -----
  function makeFaceTexture(label, highlighted = false) {
    const tc = THEMES[currentTheme];
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = highlighted ? '#2a3d5c' : tc.gizmoFill;
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = highlighted ? '#58a6ff' : tc.gizmoBorder;
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 122, 122);
    ctx.fillStyle = highlighted ? '#58a6ff' : tc.gizmoText;
    ctx.font = 'bold 19px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  function setTheme(theme) {
    currentTheme = THEMES[theme] ? theme : 'dark';
    if (!initialized) return;
    const tc = THEMES[currentTheme];
    scene.background = new THREE.Color(tc.bg);
    scene.fog = new THREE.Fog(tc.bg, VOLUME * 1.5, VOLUME * 4);
    if (gizmoCube) {
      gizmoCube.material.forEach((m, i) => {
        if (m.map) m.map.dispose();
        m.map = makeFaceTexture(GIZMO_FACE_LABELS[i], i === hoveredGizmoFace);
        m.needsUpdate = true;
      });
    }
    if (groundGrid) {
      const wasVisible = groundGrid.visible;
      scene.remove(groundGrid);
      groundGrid.geometry.dispose();
      groundGrid.material.dispose();
      groundGrid = new THREE.GridHelper(VOLUME * 2, 24, tc.gridMain, tc.gridSub);
      groundGrid.position.y = -VOLUME;
      groundGrid.material.transparent = true;
      groundGrid.material.opacity = 0.45;
      groundGrid.visible = wasVisible;
      scene.add(groundGrid);
    }
  }

  // ----- Camera tool buttons -----
  function zoomBy(factor) {
    if (!controls || !camera) return;
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
    const newDist = THREE.MathUtils.clamp(
      dir.length() * factor,
      controls.minDistance,
      controls.maxDistance,
    );
    dir.setLength(newDist);
    camera.position.copy(controls.target).add(dir);
  }
  function zoomIn()  { zoomBy(0.85); }
  function zoomOut() { zoomBy(1 / 0.85); }

  function togglePanMode() {
    if (!controls) return false;
    panMode = !panMode;
    controls.mouseButtons = panMode
      ? { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    return panMode;
  }

  function toggleGrid() {
    if (!groundGrid) return false;
    groundGrid.visible = !groundGrid.visible;
    return groundGrid.visible;
  }

  function initGizmo() {
    gizmoScene = new THREE.Scene();
    gizmoCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    gizmoCamera.position.set(0, 0, 4);
    gizmoCamera.lookAt(0, 0, 0);

    gizmoRenderer = new THREE.WebGLRenderer({ canvas: gizmoCanvasEl, antialias: true, alpha: true });
    gizmoRenderer.setPixelRatio(window.devicePixelRatio);
    const sz = gizmoCanvasEl.clientWidth || 110;
    gizmoRenderer.setSize(sz, sz, false);

    const materials = GIZMO_FACE_LABELS.map(l => new THREE.MeshBasicMaterial({ map: makeFaceTexture(l) }));
    gizmoCube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), materials);
    gizmoScene.add(gizmoCube);

    gizmoEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(gizmoCube.geometry),
      new THREE.LineBasicMaterial({ color: 0x58a6ff, opacity: 0.55, transparent: true })
    );
    gizmoCube.add(gizmoEdges);

    gizmoCanvasEl.addEventListener('click', onGizmoClick);
    gizmoCanvasEl.addEventListener('pointermove', onGizmoHover);
    gizmoCanvasEl.addEventListener('pointerleave', () => setHoveredFace(-1));
  }

  function raycastGizmoFace(e) {
    const rect = gizmoCanvasEl.getBoundingClientRect();
    gizmoMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    gizmoMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    gizmoRaycaster.setFromCamera(gizmoMouse, gizmoCamera);
    const hits = gizmoRaycaster.intersectObject(gizmoCube);
    return hits.length ? hits[0] : null;
  }

  function setHoveredFace(materialIndex) {
    if (hoveredGizmoFace === materialIndex) return;
    if (hoveredGizmoFace >= 0) {
      const m = gizmoCube.material[hoveredGizmoFace];
      if (m.map) m.map.dispose();
      m.map = makeFaceTexture(GIZMO_FACE_LABELS[hoveredGizmoFace]);
      m.needsUpdate = true;
    }
    hoveredGizmoFace = materialIndex;
    if (materialIndex >= 0) {
      const m = gizmoCube.material[materialIndex];
      if (m.map) m.map.dispose();
      m.map = makeFaceTexture(GIZMO_FACE_LABELS[materialIndex], true);
      m.needsUpdate = true;
    }
  }
  function onGizmoHover(e) {
    const hit = raycastGizmoFace(e);
    setHoveredFace(hit ? hit.face.materialIndex : -1);
  }
  function onGizmoClick(e) {
    const hit = raycastGizmoFace(e);
    if (!hit) return;
    const worldDir = hit.face.normal.clone();
    snapMainCameraTo(worldDir);
  }
  function snapMainCameraTo(worldDir) {
    const dist = camera.position.distanceTo(controls.target);
    const newPos = controls.target.clone().add(worldDir.clone().normalize().multiplyScalar(dist));
    animateCameraTo(newPos, controls.target.clone());
  }
  const _gizmoDir = new THREE.Vector3();
  function renderGizmo() {
    if (!gizmoCube || !camera || !controls) return;
    _gizmoDir.subVectors(camera.position, controls.target).normalize();
    gizmoCamera.position.copy(_gizmoDir).multiplyScalar(4);
    gizmoCamera.up.copy(camera.up);
    gizmoCamera.lookAt(0, 0, 0);
    gizmoRenderer.render(gizmoScene, gizmoCamera);
  }

  function animate() {
    if (!active) { rafId = 0; return; }
    step();
    controls.autoRotate = autoRotate;
    controls.update();
    updateMeshesFromSimulation();
    updateLabels();
    renderer.render(scene, camera);
    renderGizmo();
    rafId = requestAnimationFrame(animate);
  }

  // ----- Picking -----
  function ndcFromEvent(e) {
    const rect = canvasEl.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }
  function pickNode(e) {
    ndcFromEvent(e);
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects([...nodeMeshes.values()]);
    return hits.length ? hits[0].object.userData.id : null;
  }

  canvasEl.addEventListener('pointermove', (e) => {
    if (!active) return;
    const id = pickNode(e);
    if (id !== S.hoveredId) Cart.setHovered(id);
    if (e.buttons !== 0) {
      const dx = e.clientX - pointerDownX, dy = e.clientY - pointerDownY;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) pointerDragged = true;
    }
  });
  canvasEl.addEventListener('pointerdown', (e) => {
    pointerDownX = e.clientX; pointerDownY = e.clientY; pointerDragged = false;
  });
  canvasEl.addEventListener('pointerup', (e) => {
    if (!active) return;
    if (pointerDragged) return;
    if (e.button !== 0) return;
    const id = pickNode(e);
    if (id) Cart.setPinned(id);
  });
  canvasEl.addEventListener('dblclick', (e) => {
    if (!active) return;
    const id = pickNode(e);
    if (!id && S.pinnedId) {
      S.pinnedId = null;
      Cart.clearPath();
      applyHighlight();
      Cart.renderInfo();
      resetZoom();
    }
  });

  // ----- Highlight -----
  function applyHighlight() {
    if (!active || !scene) return;
    const focusId = S.pinnedId || S.hoveredId;

    nodeMeshes.forEach((mesh, id) => {
      const n = S.nodeById.get(id);
      const visible = !!n && S.activeCats.has(n.cat);
      mesh.visible = visible;
      if (!visible) return;
      // Depth tint in path mode; otherwise category color from userData.
      // Includes depth 0 — entry chain shares one bucket so the launch
      // plumbing doesn't visually compete with real screens.
      let color = mesh.userData.baseColor;
      if (S.pathMode && S.stepDistances) {
        const d = S.stepDistances.get(id);
        if (d != null) color = Cart.depthColorInt(d);
      }
      mesh.material.color.setHex(color);
      mesh.material.emissive.setHex(color);
      mesh.material.emissiveIntensity = 0.15;
      mesh.material.opacity = 1;
      mesh.material.transparent = false;
      mesh.scale.setScalar(1);
    });

    edgeObjects.forEach(({ mesh, arrow, data, material, arrowMaterial }) => {
      const sCat = S.nodeById.get(data.src)?.cat;
      const dCat = S.nodeById.get(data.dst)?.cat;
      const visible = S.activeCats.has(sCat) && S.activeCats.has(dCat);
      mesh.visible = visible;
      arrow.visible = visible;
      material.color.setHex(PIPE_COLOR_BASE);
      material.opacity = data.type === 'embed' ? 0.55 : 0.85;
      arrowMaterial.color.setHex(PIPE_COLOR_BASE);
      arrowMaterial.opacity = data.type === 'embed' ? 0.7 : 1.0;
    });

    nodeLabels.forEach((el, id) => {
      el.classList.remove('dim', 'active', 'pinned');
      const n = S.nodeById.get(id);
      if (n && !S.activeCats.has(n.cat)) el.classList.add('hidden');
      else el.classList.remove('hidden');
    });

    if (S.pathNodes && S.pathEdges) {
      const PATH_COLOR = 0x58a6ff;
      nodeMeshes.forEach((mesh, id) => {
        if (!mesh.visible) return;
        if (!S.pathNodes.has(id)) {
          mesh.material.transparent = true;
          mesh.material.opacity = 0.12;
          mesh.material.emissiveIntensity = 0.02;
        } else {
          mesh.material.emissiveIntensity = 0.5;
          if (id === S.pinnedId) mesh.scale.setScalar(1.4);
        }
      });
      edgeObjects.forEach(({ mesh, data, material, arrowMaterial }) => {
        if (!mesh.visible) return;
        if (S.pathEdges.has(data)) {
          material.color.setHex(PATH_COLOR);
          arrowMaterial.color.setHex(PATH_COLOR);
          material.opacity = 1;
          arrowMaterial.opacity = 1;
        } else {
          material.opacity = 0.04;
          arrowMaterial.opacity = 0.04;
        }
      });
      nodeLabels.forEach((el, id) => {
        if (el.classList.contains('hidden')) return;
        if (id === S.pinnedId) el.classList.add('pinned');
        else if (S.pathNodes.has(id)) el.classList.add('active');
        else el.classList.add('dim');
      });
      return;
    }

    if (!focusId) return;
    const related = new Set([focusId]);
    (S.outEdges.get(focusId) || []).forEach(e => related.add(e.dst));
    (S.inEdges.get(focusId) || []).forEach(e => related.add(e.src));

    nodeMeshes.forEach((mesh, id) => {
      if (!mesh.visible) return;
      if (!related.has(id)) {
        mesh.material.transparent = true;
        mesh.material.opacity = 0.15;
        mesh.material.emissiveIntensity = 0.02;
      } else if (id === focusId) {
        mesh.material.emissiveIntensity = 0.55;
        mesh.scale.setScalar(1.4);
      }
    });
    edgeObjects.forEach(({ mesh, data, material, arrowMaterial }) => {
      if (!mesh.visible) return;
      if (data.src === focusId) {
        material.color.setHex(0x7ee787); arrowMaterial.color.setHex(0x7ee787);
        material.opacity = 1; arrowMaterial.opacity = 1;
      } else if (data.dst === focusId) {
        material.color.setHex(0xff7b72); arrowMaterial.color.setHex(0xff7b72);
        material.opacity = 1; arrowMaterial.opacity = 1;
      } else {
        material.opacity = 0.06; arrowMaterial.opacity = 0.06;
      }
    });
    nodeLabels.forEach((el, id) => {
      if (el.classList.contains('hidden')) return;
      if (id === focusId) el.classList.add(S.pinnedId === id ? 'pinned' : 'active');
      else if (!related.has(id)) el.classList.add('dim');
    });
  }

  // ----- Focus / fit / reset -----
  function animateCameraTo(pos, look) {
    camTargetPos.copy(pos); camTargetLook.copy(look);
    if (!cameraAnimating) {
      cameraAnimating = true;
      requestAnimationFrame(stepCameraAnim);
    }
  }
  function stepCameraAnim() {
    const EASE = 0.12;
    camera.position.lerp(camTargetPos, EASE);
    controls.target.lerp(camTargetLook, EASE);
    if (camera.position.distanceTo(camTargetPos) < 0.5 &&
        controls.target.distanceTo(camTargetLook) < 0.5) {
      camera.position.copy(camTargetPos);
      controls.target.copy(camTargetLook);
      cameraAnimating = false;
      return;
    }
    requestAnimationFrame(stepCameraAnim);
  }

  function focusOnNode(id) {
    const n = S.nodeById.get(id);
    if (!n) return;
    const related = new Set([id]);
    (S.outEdges.get(id) || []).forEach(e => related.add(e.dst));
    (S.inEdges.get(id) || []).forEach(e => related.add(e.src));
    let cx = 0, cy = 0, cz = 0, count = 0;
    related.forEach(rid => {
      const r = S.nodeById.get(rid); if (!r) return;
      cx += r.x; cy += r.y; cz += r.z; count++;
    });
    if (count === 0) return;
    cx /= count; cy /= count; cz /= count;
    let maxR = 0;
    related.forEach(rid => {
      const r = S.nodeById.get(rid); if (!r) return;
      const dx = r.x - cx, dy = r.y - cy, dz = r.z - cz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > maxR) maxR = dist;
    });
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    const fov = camera.fov * Math.PI / 180;
    const dist = (maxR + 30) / Math.sin(fov / 2);
    const target = new THREE.Vector3(cx, cy, cz);
    animateCameraTo(target.clone().add(dir.multiplyScalar(dist)), target);
  }

  function fitVisibleNodes() {
    const visible = S.NODES.filter(n => S.activeCats.has(n.cat));
    if (visible.length === 0) return;
    let cx = 0, cy = 0, cz = 0;
    visible.forEach(n => { cx += n.x; cy += n.y; cz += n.z; });
    cx /= visible.length; cy /= visible.length; cz /= visible.length;
    let maxR = 0;
    visible.forEach(n => {
      const dx = n.x - cx, dy = n.y - cy, dz = n.z - cz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > maxR) maxR = d;
    });
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    const fov = camera.fov * Math.PI / 180;
    const dist = (maxR + 40) / Math.sin(fov / 2);
    const target = new THREE.Vector3(cx, cy, cz);
    animateCameraTo(target.clone().add(dir.multiplyScalar(dist)), target);
  }

  function resetZoom() {
    animateCameraTo(
      new THREE.Vector3(VOLUME * 0.8, VOLUME * 0.5, VOLUME * 1.4),
      new THREE.Vector3(0, 0, 0),
    );
  }

  function setAutoRotate(on) { autoRotate = !!on; }

  // ----- Lifecycle -----
  function refresh() {
    if (!initialized) return; // can't refresh before activate runs initScene
    clearScene();
    initialiseLayout();
    S.positionsBy = '3d';
    renderNodes();
    renderEdges();
    applyHighlight();
    resetZoom();
    autoFitPending = true;
    reheat();
  }

  function activate() {
    active = true;
    document.body.classList.add('mode-3d');
    document.body.classList.remove('mode-2d');

    if (!initialized) {
      initScene();
      initGizmo();
      initialized = true;
      // First-time activation must populate the scene from current state.
      clearScene();
      initialiseLayout();
      S.positionsBy = '3d';
      renderNodes();
      renderEdges();
      applyHighlight();
    } else if (S.positionsBy !== '3d') {
      // 2D mutated positions to canvas pixels in its own range. Re-init in
      // the 3D cube and rebuild the meshes/labels at the new coordinates.
      initialiseLayout();
      S.positionsBy = '3d';
      autoFitPending = true;
    }
    resizeRenderer();
    reheat();
    if (!rafId) rafId = requestAnimationFrame(animate);
  }

  function deactivate() {
    active = false;
    simulationRunning = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }

  function onResize() {
    resizeRenderer();
  }
  window.addEventListener('resize', () => { if (active) onResize(); });

  window.View3D = {
    activate, deactivate, refresh,
    applyHighlight,
    focusOnNode, fitVisibleNodes,
    resetLayout: () => { initialiseLayout(); autoFitPending = true; reheat(); },
    resetZoom,
    setShowLabels: () => { /* 3D reads showLabels live in updateLabels */ },
    setAutoRotate,
    setTheme,
    onResize,
    // Tool-bar actions
    zoomIn, zoomOut, togglePanMode, toggleGrid,
    isPanMode: () => panMode,
    isGridVisible: () => !!groundGrid?.visible,
  };
})();
