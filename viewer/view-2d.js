// ===== 2D viewer =====
// SVG-based force-directed graph with zoom/pan/drag. Plugs into Cart core.

(function () {
  const S = Cart.state;

  // DOM
  const svg = document.getElementById('graph');
  const edgesGroup = document.getElementById('edges-group');
  const nodesGroup = document.getElementById('nodes-group');

  // Per-node SVG element cache, rebuilt by renderNodes/renderEdges.
  const nodeEls = new Map();
  const edgeEls = [];

  // Layout/sim state
  let simulationRunning = false;
  let temperature = 1.0;
  let frameCount = 0;
  let autoFitPending = false;

  const REPULSION = 65000;
  const SPRING_LEN = 150;
  const SPRING_K = 0.012;
  const CLUSTER_K = 0.025;
  const CENTER_K = 0.0008;
  const MIN_DIST = 30;
  const DAMPING = 0.85;

  // Zoom/pan
  let zoom = 1, panX = 0, panY = 0;
  let panning = false, panStartX = 0, panStartY = 0;
  let targetZoom = 1, targetPanX = 0, targetPanY = 0;
  let viewAnimating = false;

  // Label sizing for fit math (no DOM measurement needed).
  const LABEL_FONT_PX = 11;
  const LABEL_CHAR_PX = 6.5;

  let active = false;

  function canvasSize() {
    const rect = svg.getBoundingClientRect();
    return {
      w: rect.width || window.innerWidth - 300,
      h: rect.height || window.innerHeight,
    };
  }

  function initialiseLayout() {
    const { w, h } = canvasSize();
    const byCat = new Map();
    S.NODES.forEach(n => {
      if (!byCat.has(n.cat)) byCat.set(n.cat, []);
      byCat.get(n.cat).push(n);
    });
    byCat.forEach((nodes, cat) => {
      const anchor = S.CLUSTER_ANCHORS[cat] || { fx: 0.5, fy: 0.5 };
      const ax = anchor.fx * w;
      const ay = anchor.fy * h;
      const ringR = 30 + Math.sqrt(nodes.length) * 22;
      nodes.forEach((n, i) => {
        const angle = (i / nodes.length) * Math.PI * 2;
        n.x = ax + Math.cos(angle) * ringR + (Math.random() - 0.5) * 15;
        n.y = ay + Math.sin(angle) * ringR + (Math.random() - 0.5) * 15;
        n.vx = 0; n.vy = 0;
        n.fx2d = 0; n.fy2d = 0;
        n.fixed = false;
        n.anchorX = ax; n.anchorY = ay;
      });
    });
  }

  function renderNodes() {
    nodesGroup.innerHTML = '';
    nodeEls.clear();

    S.NODES.forEach(n => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'node');
      g.setAttribute('data-cat', n.cat);
      g.setAttribute('data-id', n.id);

      const r = n.size || 7;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', r);
      g.appendChild(circle);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('y', -(r + 6));
      text.textContent = n.label;
      if (!S.showLabels) text.style.display = 'none';
      g.appendChild(text);

      const stepText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      stepText.setAttribute('class', 'step-label');
      stepText.setAttribute('y', 3);
      stepText.textContent = '';
      g.appendChild(stepText);

      g.addEventListener('mouseenter', () => Cart.setHovered(n.id));
      g.addEventListener('mouseleave', () => Cart.setHovered(null));
      g.addEventListener('click', (e) => { e.stopPropagation(); Cart.setPinned(n.id); });

      enableDrag(g, n);

      nodesGroup.appendChild(g);
      nodeEls.set(n.id, g);
    });
  }

  function renderEdges() {
    edgesGroup.innerHTML = '';
    edgeEls.length = 0;

    S.EDGES.forEach(e => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('class', `edge ${e.type}`);
      path.setAttribute('marker-end', 'url(#arrow)');
      path.dataset.src = e.src;
      path.dataset.dst = e.dst;
      edgesGroup.appendChild(path);
      edgeEls.push({ el: path, data: e });
    });
  }

  function tickRender() {
    S.NODES.forEach(n => {
      const el = nodeEls.get(n.id);
      if (el) el.setAttribute('transform', `translate(${n.x}, ${n.y})`);
    });
    edgeEls.forEach(({ el, data }) => {
      const s = S.nodeById.get(data.src);
      const d = S.nodeById.get(data.dst);
      if (!s || !d) return;
      const dx = d.x - s.x;
      const dy = d.y - s.y;
      const dr = Math.sqrt(dx * dx + dy * dy);
      const curve = data.type === 'embed' ? dr * 0.15 : dr * 0.3;
      const mx = (s.x + d.x) / 2;
      const my = (s.y + d.y) / 2;
      const nx = -dy / (dr || 1);
      const ny = dx / (dr || 1);
      const cx = mx + nx * curve * 0.3;
      const cy = my + ny * curve * 0.3;
      el.setAttribute('d', `M${s.x},${s.y} Q${cx},${cy} ${d.x},${d.y}`);
    });
  }

  function step() {
    if (!active || !simulationRunning) return;
    const { w, h } = canvasSize();
    for (const n of S.NODES) { n.fx2d = 0; n.fy2d = 0; }

    for (let i = 0; i < S.NODES.length; i++) {
      const a = S.NODES[i];
      for (let j = i + 1; j < S.NODES.length; j++) {
        const b = S.NODES[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.sqrt(dx * dx + dy * dy) || 1; }
        let force = REPULSION / (d * d);
        if (d < MIN_DIST) force += (MIN_DIST - d) * 4;
        const ux = dx / d, uy = dy / d;
        a.fx2d += ux * force; a.fy2d += uy * force;
        b.fx2d -= ux * force; b.fy2d -= uy * force;
      }
    }

    const cx = w / 2, cy = h / 2;
    for (const n of S.NODES) {
      n.fx2d += (n.anchorX - n.x) * CLUSTER_K;
      n.fy2d += (n.anchorY - n.y) * CLUSTER_K;
      n.fx2d += (cx - n.x) * CENTER_K;
      n.fy2d += (cy - n.y) * CENTER_K;
    }

    for (const e of S.EDGES) {
      const a = S.nodeById.get(e.src);
      const b = S.nodeById.get(e.dst);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const diff = d - SPRING_LEN;
      const force = diff * SPRING_K;
      const fx = (dx / d) * force, fy = (dy / d) * force;
      a.fx2d += fx; a.fy2d += fy;
      b.fx2d -= fx; b.fy2d -= fy;
    }

    let totalMotion = 0;
    const pad = 30;
    const MAX_SPEED = 25;
    for (const n of S.NODES) {
      if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
      n.vx = (n.vx + n.fx2d * temperature) * DAMPING;
      n.vy = (n.vy + n.fy2d * temperature) * DAMPING;
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (speed > MAX_SPEED) { n.vx = (n.vx / speed) * MAX_SPEED; n.vy = (n.vy / speed) * MAX_SPEED; }
      n.x += n.vx; n.y += n.vy;
      totalMotion += Math.abs(n.vx) + Math.abs(n.vy);
      if (n.x < pad) { n.x = pad; n.vx *= -0.3; }
      if (n.x > w - pad) { n.x = w - pad; n.vx *= -0.3; }
      if (n.y < pad) { n.y = pad; n.vy *= -0.3; }
      if (n.y > h - pad) { n.y = h - pad; n.vy *= -0.3; }
    }

    frameCount++;
    if (frameCount > 90) temperature = Math.max(0.08, temperature * 0.992);
    tickRender();

    if (totalMotion > 0.3 || frameCount < 90) {
      requestAnimationFrame(step);
    } else {
      simulationRunning = false;
      if (autoFitPending && !S.pinnedId && !panning) {
        autoFitPending = false;
        fitVisibleNodes({ snapToDefaultIfAll: false });
      }
    }
  }

  function reheat() {
    temperature = 1.0;
    frameCount = 0;
    if (!simulationRunning) {
      simulationRunning = true;
      requestAnimationFrame(step);
    }
  }

  function enableDrag(g, node) {
    let dragging = false;
    let startX = 0, startY = 0, nodeStartX = 0, nodeStartY = 0;

    g.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dragging = true;
      node.fixed = true;
      startX = e.clientX; startY = e.clientY;
      nodeStartX = node.x; nodeStartY = node.y;
      g.setPointerCapture(e.pointerId);
      svg.classList.add('dragging');
    });
    g.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      node.x = nodeStartX + (e.clientX - startX);
      node.y = nodeStartY + (e.clientY - startY);
      tickRender();
      reheat();
    });
    const stop = (e) => {
      if (!dragging) return;
      dragging = false;
      node.fixed = false;
      g.releasePointerCapture(e.pointerId);
      svg.classList.remove('dragging');
    };
    g.addEventListener('pointerup', stop);
    g.addEventListener('pointercancel', stop);
  }

  // ----- Zoom / pan -----
  function applyTransform() {
    edgesGroup.setAttribute('transform', `translate(${panX}, ${panY}) scale(${zoom})`);
    nodesGroup.setAttribute('transform', `translate(${panX}, ${panY}) scale(${zoom})`);
  }

  function animateViewTo(z, px, py) {
    targetZoom = z; targetPanX = px; targetPanY = py;
    if (!viewAnimating) {
      viewAnimating = true;
      requestAnimationFrame(animateViewStep);
    }
  }
  function animateViewStep() {
    const EASE = 0.18;
    const dz = targetZoom - zoom, dx = targetPanX - panX, dy = targetPanY - panY;
    if (Math.abs(dz) < 0.002 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      zoom = targetZoom; panX = targetPanX; panY = targetPanY;
      applyTransform();
      viewAnimating = false;
      return;
    }
    zoom += dz * EASE; panX += dx * EASE; panY += dy * EASE;
    applyTransform();
    requestAnimationFrame(animateViewStep);
  }

  svg.addEventListener('wheel', (e) => {
    if (!active) return;
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const delta = -e.deltaY * 0.001;
    const newZoom = Math.min(3, Math.max(0.3, zoom * (1 + delta)));
    panX = mx - (mx - panX) * (newZoom / zoom);
    panY = my - (my - panY) * (newZoom / zoom);
    zoom = newZoom;
    applyTransform();
  }, { passive: false });

  svg.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.node')) return;
    panning = true;
    panStartX = e.clientX - panX;
    panStartY = e.clientY - panY;
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!panning) return;
    panX = e.clientX - panStartX;
    panY = e.clientY - panStartY;
    applyTransform();
  });
  svg.addEventListener('pointerup', (e) => {
    panning = false;
    try { svg.releasePointerCapture(e.pointerId); } catch {}
  });
  svg.addEventListener('click', () => {
    if (S.pinnedId) {
      S.pinnedId = null;
      Cart.clearPath();
      applyHighlight();
      Cart.renderInfo();
      Cart.updateBackButton();
      resetZoom();
    }
  });

  // ----- Fitting -----
  function labelExtent(node) {
    const r = node.size || 7;
    const halfW = (node.label.length * LABEL_CHAR_PX) / 2 + 4;
    return {
      left: halfW, right: halfW,
      top: r + 6 + LABEL_FONT_PX, bottom: r + 2,
    };
  }

  function fitNodeSet(ids) {
    const nodes = [];
    ids.forEach(id => { const n = S.nodeById.get(id); if (n) nodes.push(n); });
    if (nodes.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      const ex = labelExtent(n);
      minX = Math.min(minX, n.x - ex.left); maxX = Math.max(maxX, n.x + ex.right);
      minY = Math.min(minY, n.y - ex.top);  maxY = Math.max(maxY, n.y + ex.bottom);
    });
    const pad = 40;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const bboxW = Math.max(maxX - minX, 1);
    const bboxH = Math.max(maxY - minY, 1);
    const { w, h } = canvasSize();
    const newZoom = Math.min(w / bboxW, h / bboxH, 2.8);
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    animateViewTo(newZoom, w / 2 - centerX * newZoom, h / 2 - centerY * newZoom);
  }

  function fitVisibleNodes({ snapToDefaultIfAll = true } = {}) {
    const visible = S.NODES.filter(n => S.activeCats.has(n.cat));
    if (visible.length === 0) return;
    if (snapToDefaultIfAll && visible.length === S.NODES.length) {
      animateViewTo(1, 0, 0);
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    visible.forEach(n => {
      const ex = labelExtent(n);
      minX = Math.min(minX, n.x - ex.left); maxX = Math.max(maxX, n.x + ex.right);
      minY = Math.min(minY, n.y - ex.top);  maxY = Math.max(maxY, n.y + ex.bottom);
    });
    const pad = 30;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const bboxW = Math.max(maxX - minX, 1);
    const bboxH = Math.max(maxY - minY, 1);
    const { w, h } = canvasSize();
    const newZoom = Math.min(w / bboxW, h / bboxH, 2.8);
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    animateViewTo(newZoom, w / 2 - centerX * newZoom, h / 2 - centerY * newZoom);
  }

  function focusOnNode(id) {
    const focusNode = S.nodeById.get(id);
    if (!focusNode) return;
    const neighbours = new Set([id]);
    (S.outEdges.get(id) || []).forEach(e => neighbours.add(e.dst));
    (S.inEdges.get(id) || []).forEach(e => neighbours.add(e.src));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    neighbours.forEach(nid => {
      const n = S.nodeById.get(nid);
      if (!n) return;
      const ex = labelExtent(n);
      minX = Math.min(minX, n.x - ex.left); maxX = Math.max(maxX, n.x + ex.right);
      minY = Math.min(minY, n.y - ex.top);  maxY = Math.max(maxY, n.y + ex.bottom);
    });
    const pad = 30;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const bboxW = Math.max(maxX - minX, 1), bboxH = Math.max(maxY - minY, 1);
    const { w, h } = canvasSize();
    const newZoom = Math.min(w / bboxW, h / bboxH, 2.8);
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    animateViewTo(newZoom, w / 2 - centerX * newZoom, h / 2 - centerY * newZoom);
  }

  function resetZoom() {
    animateViewTo(1, 0, 0);
  }

  // ----- Step labels (path mode) -----
  function refreshStepLabels() {
    nodeEls.forEach((g, id) => {
      const t = g.querySelector('.step-label');
      if (!t) return;
      if (S.stepDistances && S.stepDistances.has(id)) {
        t.textContent = String(S.stepDistances.get(id));
      } else {
        t.textContent = '';
      }
    });
  }

  // ----- Highlight -----
  function applyHighlight() {
    if (!active) return;
    const focusId = S.hoveredId || S.pinnedId;

    nodeEls.forEach((el, id) => {
      el.classList.remove('active', 'dim', 'pinned');
      const node = S.nodeById.get(id);
      if (node && !S.activeCats.has(node.cat)) el.classList.add('hidden');
      else el.classList.remove('hidden');

      // Depth heatmap: tint by distance from the entry chain while path mode
      // is on. Entry nodes (depth 0) get the depth-0 color too, not their
      // category color — they all collapse to a single bucket.
      const circle = el.querySelector('circle');
      if (circle) {
        if (S.pathMode && S.stepDistances) {
          const d = S.stepDistances.get(id);
          circle.style.fill = (d != null) ? Cart.depthColor(d) : '';
        } else {
          circle.style.fill = '';
        }
      }
    });

    edgeEls.forEach(({ el, data }) => {
      el.classList.remove('active', 'active-out', 'active-in', 'dim', 'path');
      el.setAttribute('marker-end', 'url(#arrow)');
      const srcCat = S.nodeById.get(data.src)?.cat;
      const dstCat = S.nodeById.get(data.dst)?.cat;
      const visible = S.activeCats.has(srcCat) && S.activeCats.has(dstCat);
      el.style.display = visible ? '' : 'none';
    });

    if (S.pinnedId) {
      const el = nodeEls.get(S.pinnedId);
      if (el) el.classList.add('pinned');
    }

    if (S.pathNodes && S.pathEdges) {
      nodeEls.forEach((el, id) => {
        if (S.pathNodes.has(id)) {
          el.classList.remove('dim');
          if (id !== S.pinnedId) el.classList.add('active');
        } else {
          el.classList.add('dim');
        }
      });
      edgeEls.forEach(({ el, data }) => {
        if (S.pathEdges.has(data)) {
          el.classList.remove('dim');
          el.classList.add('path');
          el.setAttribute('marker-end', 'url(#arrow-path)');
        } else {
          el.classList.add('dim');
        }
      });
      return;
    }

    if (!focusId) return;

    nodeEls.forEach(el => el.classList.add('dim'));
    edgeEls.forEach(({ el }) => el.classList.add('dim'));
    const focusEl = nodeEls.get(focusId);
    if (focusEl) {
      focusEl.classList.remove('dim');
      focusEl.classList.add('active');
    }
    (S.outEdges.get(focusId) || []).forEach(e => {
      nodeEls.get(e.dst)?.classList.remove('dim');
      edgeEls.forEach(({ el, data }) => {
        if (data.src === focusId && data.dst === e.dst) {
          el.classList.remove('dim');
          el.classList.add('active-out');
          el.setAttribute('marker-end', 'url(#arrow-active)');
        }
      });
    });
    (S.inEdges.get(focusId) || []).forEach(e => {
      nodeEls.get(e.src)?.classList.remove('dim');
      edgeEls.forEach(({ el, data }) => {
        if (data.dst === focusId && data.src === e.src) {
          el.classList.remove('dim');
          el.classList.add('active-in');
          el.setAttribute('marker-end', 'url(#arrow-active)');
        }
      });
    });
  }

  function setShowLabels(on) {
    nodesGroup.querySelectorAll('.node text:not(.step-label)').forEach(t => {
      t.style.display = on ? '' : 'none';
    });
  }

  // ----- Lifecycle hooks -----
  function refresh() {
    zoom = 1; panX = 0; panY = 0;
    targetZoom = 1; targetPanX = 0; targetPanY = 0;
    applyTransform();
    autoFitPending = true;

    renderNodes();
    renderEdges();
    initialiseLayout();
    S.positionsBy = '2d';
    tickRender();
    refreshStepLabels();
    applyHighlight();
    reheat();
  }

  function activate() {
    active = true;
    document.body.classList.add('mode-2d');
    document.body.classList.remove('mode-3d');
    // If the other view last wrote node positions, those are in a different
    // coordinate space — re-init layout so 2D starts from clean canvas pixels.
    if (S.positionsBy !== '2d') {
      initialiseLayout();
      S.positionsBy = '2d';
      autoFitPending = true;
      tickRender();
    }
    reheat();
    applyHighlight();
  }

  function deactivate() {
    active = false;
    simulationRunning = false;
  }

  function onResize() {
    const { w, h } = canvasSize();
    Object.keys(S.CLUSTER_ANCHORS).forEach(cat => {
      const a = S.CLUSTER_ANCHORS[cat];
      S.NODES.filter(n => n.cat === cat).forEach(n => {
        n.anchorX = a.fx * w;
        n.anchorY = a.fy * h;
      });
    });
    reheat();
  }
  window.addEventListener('resize', () => { if (active) onResize(); });

  // Public interface
  window.View2D = {
    activate, deactivate, refresh,
    applyHighlight,
    focusOnNode, fitVisibleNodes,
    resetLayout: () => { initialiseLayout(); autoFitPending = true; reheat(); },
    resetZoom,
    refreshStepLabels,
    setShowLabels,
    onResize,
  };
})();
