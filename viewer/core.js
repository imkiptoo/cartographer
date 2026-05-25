// ===== Cartographer core =====
// Shared state, data ops, sidebar UI rendering, and the loadMap orchestrator.
// Each renderer (2D / 3D) plugs into this via Cart.setActiveView(...) and
// provides {refresh, applyHighlight, focusOnNode, fitVisibleNodes, resetLayout,
// resetZoom}. Core never knows what a renderer is — it just calls those hooks.

(function () {
  const state = {
    // Active map (assigned in loadMap)
    NODES: [],
    EDGES: [],
    CATEGORIES: [],
    CLUSTER_ANCHORS: {},
    currentMapId: null,

    // Adjacency (rebuilt by rebuildLookups)
    nodeById: new Map(),
    inEdges: new Map(),
    outEdges: new Map(),

    // Interaction
    activeCats: new Set(),
    hoveredId: null,
    pinnedId: null,

    // Path mode
    pathMode: false,
    pathNodes: null,
    pathEdges: null,
    stepDistances: null,

    // Toggles
    showLabels: true,

    // Tracks which view last initialised node positions. Used so the other
    // view can detect coordinate-space mismatch and re-init on activate.
    positionsBy: null,
  };

  // Palette mapping for 3D meshes — populated by applyCategoryPalette.
  const CAT_COLORS = {};

  // Depth palette for path mode. Index = BFS distance from the entry chain.
  // The launch chain (every node in the `entry` category) is treated as a
  // single depth-0 bucket so plumbing like main → MaterialApp → SplashScreen
  // doesn't inflate every real screen's depth.
  const DEPTH_PALETTE = [
    '#22c55e', // 0: green — entry chain
    '#84cc16', // 1: lime
    '#eab308', // 2: yellow
    '#f59e0b', // 3: amber
    '#f97316', // 4: orange
    '#ef4444', // 5: red
    '#a3174d', // 6+: crimson
  ];

  function depthColor(distance) {
    if (distance == null || distance < 0) return null;
    return DEPTH_PALETTE[Math.min(distance, DEPTH_PALETTE.length - 1)];
  }
  function depthColorInt(distance) {
    const hex = depthColor(distance);
    if (!hex) return 0x888888;
    return parseInt(hex.slice(1), 16);
  }

  // Fallback palette for maps that pre-date `color` per category.
  const LEGACY = {
    entry: 0xf9c74f, auth: 0xf8961e, shell: 0xf94144, settings: 0x9d4edd,
    animal: 0x43aa8b, health: 0xf3722c, breeding: 0xec4899, batch: 0x4cc9f0,
    production: 0x90be6d, debug: 0x6c757d,
  };

  function hexStringToInt(hex) {
    if (hex.startsWith('#')) hex = hex.slice(1);
    return parseInt(hex, 16);
  }
  function intToHexString(n) {
    return '#' + n.toString(16).padStart(6, '0');
  }

  function applyCategoryPalette(categories) {
    // Wipe and rebuild the 3D color map.
    for (const k in CAT_COLORS) delete CAT_COLORS[k];

    const vars = [];
    const rules = [];
    for (const c of categories) {
      let hex;
      if (c.color) {
        hex = c.color;
        CAT_COLORS[c.id] = hexStringToInt(c.color);
      } else if (LEGACY[c.id] !== undefined) {
        hex = intToHexString(LEGACY[c.id]);
        CAT_COLORS[c.id] = LEGACY[c.id];
      } else {
        continue;
      }
      vars.push(`--cat-${c.id}: ${hex};`);
      rules.push(`.node[data-cat="${c.id}"] circle { fill: var(--cat-${c.id}); }`);
      rules.push(`.legend .dot[data-cat="${c.id}"] { background: var(--cat-${c.id}); }`);
      rules.push(`.pill[data-cat="${c.id}"] { background: var(--cat-${c.id}); }`);
    }
    const id = 'cart-palette';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = `:root { ${vars.join(' ')} }\n${rules.join('\n')}`;
  }

  // ----- Adjacency / path finding -----
  function rebuildLookups() {
    state.nodeById = new Map();
    state.inEdges = new Map();
    state.outEdges = new Map();
    state.NODES.forEach(n => {
      state.nodeById.set(n.id, n);
      state.inEdges.set(n.id, []);
      state.outEdges.set(n.id, []);
    });
    state.EDGES.forEach(e => {
      if (state.outEdges.has(e.src)) state.outEdges.get(e.src).push(e);
      if (state.inEdges.has(e.dst)) state.inEdges.get(e.dst).push(e);
    });
  }

  function findEntryNode() {
    for (const n of state.NODES) {
      if (n.cat === 'entry' && (state.inEdges.get(n.id) || []).length === 0) return n;
    }
    for (const n of state.NODES) {
      if (n.cat === 'entry') return n;
    }
    return state.NODES[0];
  }

  function bfsDistances(srcId) {
    const dist = new Map();
    const queue = [];
    // Multi-source seed: every node in the `entry` category collapses to
    // depth 0 (so the launch chain — main, MaterialApp, splash, auth gate —
    // doesn't count as real navigation steps).
    for (const n of state.NODES) {
      if (n.cat === 'entry') {
        dist.set(n.id, 0);
        queue.push(n.id);
      }
    }
    // Fallback: no entry category → fall back to single-source from srcId.
    if (queue.length === 0 && srcId) {
      dist.set(srcId, 0);
      queue.push(srcId);
    }
    while (queue.length) {
      const cur = queue.shift();
      const d = dist.get(cur);
      for (const e of state.outEdges.get(cur) || []) {
        if (!dist.has(e.dst)) {
          dist.set(e.dst, d + 1);
          queue.push(e.dst);
        }
      }
    }
    return dist;
  }

  function findPath(srcId, dstId) {
    if (srcId === dstId) return { nodes: new Set([srcId]), edges: new Set() };
    const visited = new Set([srcId]);
    const parent = new Map();
    const queue = [srcId];
    while (queue.length) {
      const cur = queue.shift();
      for (const e of state.outEdges.get(cur) || []) {
        if (visited.has(e.dst)) continue;
        visited.add(e.dst);
        parent.set(e.dst, { via: e, from: cur });
        if (e.dst === dstId) {
          const nodes = new Set([dstId]);
          const edges = new Set();
          let cursor = dstId;
          while (cursor !== srcId) {
            const step = parent.get(cursor);
            if (!step) break;
            edges.add(step.via);
            nodes.add(step.from);
            cursor = step.from;
          }
          return { nodes, edges };
        }
        queue.push(e.dst);
      }
    }
    return null;
  }

  function clearPath() {
    state.pathNodes = null;
    state.pathEdges = null;
  }

  function recomputeStepDistances() {
    if (state.pathMode) {
      const entry = findEntryNode();
      state.stepDistances = entry ? bfsDistances(entry.id) : null;
    } else {
      state.stepDistances = null;
    }
  }

  // ----- Active view registry -----
  let activeView = null;
  function setActiveView(view) {
    activeView = view;
  }
  function getActiveView() {
    return activeView;
  }

  // ----- Interaction state mutators -----
  function setHovered(id) {
    state.hoveredId = id;
    activeView?.applyHighlight();
  }

  function setPinned(id) {
    // Click on the already-pinned node toggles off.
    const toggling = state.pinnedId === id;

    if (state.pathMode) {
      const entry = findEntryNode();
      if (!entry) return;
      if (toggling) {
        state.pinnedId = null;
        clearPath();
        activeView?.resetZoom();
      } else {
        const path = findPath(entry.id, id);
        state.pinnedId = id;
        if (path) {
          state.pathNodes = path.nodes;
          state.pathEdges = path.edges;
          activeView?.focusOnPath?.(path.nodes) ?? activeView?.focusOnNode(id);
        } else {
          clearPath();
          activeView?.focusOnNode(id);
        }
      }
    } else {
      if (toggling) {
        state.pinnedId = null;
        activeView?.resetZoom();
      } else {
        state.pinnedId = id;
        activeView?.focusOnNode(id);
      }
      clearPath();
    }
    activeView?.applyHighlight();
    renderInfo();
    updateBackButton();
  }

  function setPathMode(on) {
    state.pathMode = on;
    state.pinnedId = null;
    clearPath();
    recomputeStepDistances();
    document.body.classList.toggle('path-mode', on);
    activeView?.applyHighlight();
    activeView?.refreshStepLabels?.();
    renderInfo();
    updateBackButton();
    activeView?.resetZoom();
  }

  function renderDepthLegend() {
    const strip = document.getElementById('depth-strip');
    if (!strip) return;
    strip.innerHTML = '';
    DEPTH_PALETTE.forEach((color, i) => {
      const cell = document.createElement('div');
      cell.className = 'depth-cell';
      cell.style.background = color;
      cell.textContent = i === DEPTH_PALETTE.length - 1 ? `${i}+` : String(i);
      strip.appendChild(cell);
    });
  }
  renderDepthLegend();

  function setShowLabels(on) {
    state.showLabels = on;
    activeView?.setShowLabels?.(on);
  }

  function toggleCategory(id) {
    if (state.activeCats.has(id)) state.activeCats.delete(id);
    else state.activeCats.add(id);
    activeView?.applyHighlight();
    activeView?.fitVisibleNodes();
    renderFilterButtons.updateAllButton();
  }

  function activateAllCategories() {
    state.CATEGORIES.forEach(c => state.activeCats.add(c.id));
    document.querySelectorAll('#filter-buttons button:not(#filter-all)')
      .forEach(b => b.classList.remove('inactive'));
    activeView?.applyHighlight();
    activeView?.fitVisibleNodes();
    renderFilterButtons.updateAllButton();
  }

  function resetAll() {
    activateAllCategories();
    state.pinnedId = null;
    clearPath();
    activeView?.applyHighlight();
    renderInfo();
    updateBackButton();
    activeView?.resetZoom();
  }

  // ----- Sidebar UI -----
  function renderLegend() {
    const ul = document.getElementById('legend-list');
    if (!ul) return;
    ul.innerHTML = '';
    state.CATEGORIES.forEach(c => {
      const li = document.createElement('li');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.dataset.cat = c.id;
      li.appendChild(dot);
      li.appendChild(document.createTextNode(' ' + (c.legendLabel || c.label)));
      ul.appendChild(li);
    });
  }

  function renderStats() {
    const el = document.getElementById('stats-line');
    if (!el) return;
    const pages = state.NODES.length;
    const conns = state.EDGES.length;
    el.innerHTML =
      `${pages} page${pages === 1 ? '' : 's'} &middot; ${conns} connection${conns === 1 ? '' : 's'}`;
  }

  function renderFilterButtons() {
    const root = document.getElementById('filter-buttons');
    if (!root) return;
    root.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.id = 'filter-all';
    allBtn.textContent = 'All';
    allBtn.classList.add('all-pill');
    allBtn.addEventListener('click', () => activateAllCategories());
    root.appendChild(allBtn);

    state.CATEGORIES.forEach(c => {
      const btn = document.createElement('button');
      btn.textContent = c.label;
      btn.style.borderColor = `var(--cat-${c.id})`;
      btn.style.color = `var(--cat-${c.id})`;
      btn.dataset.cat = c.id;
      btn.addEventListener('click', () => {
        if (state.activeCats.has(c.id)) btn.classList.add('inactive');
        else btn.classList.remove('inactive');
        toggleCategory(c.id);
      });
      root.appendChild(btn);
    });
    renderFilterButtons.updateAllButton();
  }
  renderFilterButtons.updateAllButton = function () {
    const btn = document.getElementById('filter-all');
    if (!btn) return;
    btn.classList.toggle('all-active', state.activeCats.size === state.CATEGORIES.length);
  };

  function renderInfo() {
    const infoContent = document.getElementById('info-content');
    if (!infoContent) return;

    if (state.NODES.length === 0) {
      infoContent.innerHTML = `<p class="hint">No map loaded. Click <strong>Upload JSON…</strong> above, or drop a cartographer snapshot anywhere on the canvas.</p>`;
      return;
    }
    if (!state.pinnedId) {
      const hint = state.pathMode
        ? 'Path mode on. Click any node to highlight the shortest route from the entry point. Click again to clear.'
        : 'Hover a node to highlight its connections. Click a node to pin its details here. Drag nodes (2D) or orbit (3D) to rearrange the view.';
      infoContent.innerHTML = `<p class="hint">${hint}</p>`;
      return;
    }

    const n = state.nodeById.get(state.pinnedId);
    if (!n) return;

    if (state.pathMode) {
      const entry = findEntryNode();
      if (state.pathNodes && state.pathEdges) {
        const ordered = [entry.id];
        let cursor = entry.id;
        while (cursor !== n.id) {
          const next = [...state.pathEdges].find(e => e.src === cursor && state.pathNodes.has(e.dst));
          if (!next) break;
          ordered.push(next.dst);
          cursor = next.dst;
        }
        const stepsHTML = ordered.map((id, i) => {
          const node = state.nodeById.get(id);
          const arrow = i < ordered.length - 1 ? '<span style="color:var(--text-dim)"> ↓</span>' : '';
          return `<li data-target="${id}" style="background:rgba(88,166,255,0.08)">${i + 1}. ${node?.label || id}${arrow}</li>`;
        }).join('');
        infoContent.innerHTML = `
          <h3>${n.label} <span class="pill" data-cat="${n.cat}">${n.cat}</span></h3>
          <p class="file-path">${n.file || ''}</p>
          <div class="conn-label">Path from ${entry.label} (${ordered.length - 1} step${ordered.length - 1 === 1 ? '' : 's'})</div>
          <ul class="conn-list">${stepsHTML}</ul>`;
      } else {
        infoContent.innerHTML = `
          <h3>${n.label} <span class="pill" data-cat="${n.cat}">${n.cat}</span></h3>
          <p class="file-path">${n.file || ''}</p>
          <div class="conn-label" style="color:var(--cat-shell, #f94144)">No path from ${entry.label}</div>
          <p class="hint">This node has no incoming edge chain from the entry point.</p>`;
      }
      infoContent.querySelectorAll('li[data-target]').forEach(li => {
        li.addEventListener('click', () => setPinned(li.dataset.target));
      });
      return;
    }

    const outs = state.outEdges.get(n.id) || [];
    const ins = state.inEdges.get(n.id) || [];
    const listHTML = (edges, dir) => {
      if (edges.length === 0) {
        return `<li class="empty">${dir === 'out' ? 'No outgoing links' : 'No incoming links'}</li>`;
      }
      return edges.map(e => {
        const other = dir === 'out' ? e.dst : e.src;
        const arrow = dir === 'out' ? '→' : '←';
        const typeLabel = e.type === 'embed' ? '⌐' : '';
        return `<li data-target="${other}">${arrow} ${other} ${typeLabel}<br><span style="color:var(--text-dim);font-size:11px">${e.via || ''}</span></li>`;
      }).join('');
    };

    infoContent.innerHTML = `
      <h3>${n.label} <span class="pill" data-cat="${n.cat}">${n.cat}</span></h3>
      <p class="file-path">${n.file || ''}</p>
      <div class="conn-label">Pushes (${outs.length})</div>
      <ul class="conn-list">${listHTML(outs, 'out')}</ul>
      <div class="conn-label">Reached from (${ins.length})</div>
      <ul class="conn-list">${listHTML(ins, 'in')}</ul>`;

    infoContent.querySelectorAll('li[data-target]').forEach(li => {
      li.addEventListener('click', () => {
        state.pinnedId = li.dataset.target;
        activeView?.applyHighlight();
        renderInfo();
        activeView?.focusOnNode(state.pinnedId);
      });
    });
  }

  function updateBackButton() {
    let btn = document.getElementById('back-button');
    const canvas = document.getElementById('canvas');
    if (state.pinnedId) {
      if (!btn && canvas) {
        btn = document.createElement('button');
        btn.id = 'back-button';
        btn.textContent = '← Back to overview';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          state.pinnedId = null;
          clearPath();
          activeView?.applyHighlight();
          renderInfo();
          activeView?.resetZoom();
          updateBackButton();
        });
        canvas.appendChild(btn);
      }
    } else if (btn) {
      btn.remove();
    }
  }

  // ----- Map switching -----
  function availableMaps() {
    return Object.values(window.MAPS || {});
  }

  function renderMapDropdown() {
    const sel = document.getElementById('map-select');
    if (!sel) return;
    sel.innerHTML = '';
    availableMaps().forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.label || m.id;
      if (m.id === state.currentMapId) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = () => loadMap(sel.value);
  }

  /// Register a JSON snapshot (as produced by `cartographer --output`) into
  /// MAPS and switch to it. Throws on missing/invalid fields.
  function registerJsonMap(json, sourceName) {
    if (!json || typeof json !== 'object') {
      throw new Error('JSON root must be an object');
    }
    if (!Array.isArray(json.nodes) || !Array.isArray(json.edges) ||
        !Array.isArray(json.categories)) {
      throw new Error('JSON must contain categories, nodes, and edges arrays');
    }
    const safeName = (sourceName || 'snapshot')
      .replace(/\.json$/i, '')
      .replace(/[^A-Za-z0-9_\-]/g, '-')
      .slice(0, 40) || 'snapshot';
    let id = `uploaded:${safeName}`;
    // Disambiguate if the user uploads two files with the same name.
    if (window.MAPS && window.MAPS[id]) {
      id = `${id}-${Date.now().toString(36)}`;
    }
    window.MAPS = window.MAPS || {};
    window.MAPS[id] = {
      id,
      label: `${safeName} (uploaded)`,
      CATEGORIES: json.categories,
      NODES: json.nodes,
      EDGES: json.edges,
      CLUSTER_ANCHORS: json.clusterAnchors || {},
    };
    renderMapDropdown();
    loadMap(id);
    return id;
  }

  function loadMap(mapId) {
    const map = (window.MAPS || {})[mapId];
    if (!map) {
      console.warn('Unknown map:', mapId);
      return;
    }
    state.currentMapId = map.id;
    state.NODES = map.NODES;
    state.EDGES = map.EDGES;
    state.CATEGORIES = map.CATEGORIES;
    state.CLUSTER_ANCHORS = map.CLUSTER_ANCHORS;
    applyCategoryPalette(state.CATEGORIES);

    // Reset interaction state for the new map.
    state.pinnedId = null;
    state.hoveredId = null;
    clearPath();
    state.activeCats = new Set(state.CATEGORIES.map(c => c.id));

    rebuildLookups();
    recomputeStepDistances();

    renderLegend();
    renderStats();
    renderFilterButtons();
    renderInfo();
    updateBackButton();

    // Let the active view re-render with new data.
    activeView?.refresh();

    if (location.hash.slice(1) !== map.id) {
      history.replaceState(null, '', '#' + map.id);
    }
    const sel = document.getElementById('map-select');
    if (sel && sel.value !== map.id) sel.value = map.id;
  }

  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id && window.MAPS && window.MAPS[id] && id !== state.currentMapId) {
      loadMap(id);
    }
  });

  // ----- Sidebar collapse -----
  function setSidebar(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', collapsed);
    // Tell the active view to re-flow after the CSS transition settles.
    setTimeout(() => activeView?.onResize?.(), 300);
  }

  // ----- Public API -----
  window.Cart = {
    state,
    CAT_COLORS,
    DEPTH_PALETTE, depthColor, depthColorInt,
    // data
    rebuildLookups, findEntryNode, bfsDistances, findPath, clearPath,
    // ui
    renderLegend, renderStats, renderFilterButtons, renderInfo,
    renderMapDropdown, updateBackButton,
    // mutators
    setHovered, setPinned, setPathMode, setShowLabels,
    toggleCategory, activateAllCategories, resetAll,
    // map
    loadMap, availableMaps, registerJsonMap,
    // view
    setActiveView, getActiveView,
    // misc
    setSidebar, applyCategoryPalette,
  };
})();
