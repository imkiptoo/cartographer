// ===== Cartographer bootstrap =====
// Wires Core + the two view modules together, owns mode switching, and binds
// the sidebar buttons + top-bar toggles.

(function () {
  const MODE_KEY = 'cart-mode';
  const THEME_KEY = 'cart-theme';
  let mode = localStorage.getItem(MODE_KEY) === '3d' ? '3d' : '2d';

  // Theme: respect persisted choice, fall back to system preference.
  let theme = localStorage.getItem(THEME_KEY);
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function applyTheme(next) {
    theme = next;
    localStorage.setItem(THEME_KEY, theme);
    document.body.classList.toggle('theme-light', theme === 'light');
    document.body.classList.toggle('theme-dark', theme === 'dark');
    window.View3D?.setTheme?.(theme);
  }

  function toggleTheme() {
    applyTheme(theme === 'light' ? 'dark' : 'light');
  }

  function activeView() {
    return mode === '3d' ? window.View3D : window.View2D;
  }

  function switchMode(next) {
    if (next === mode) return;
    const oldView = activeView();
    mode = next;
    localStorage.setItem(MODE_KEY, mode);
    Cart.setActiveView(activeView());
    oldView?.deactivate();
    activeView().activate();
    updateModeToggleUI();
  }

  function updateModeToggleUI() {
    document.querySelectorAll('.mode-switch button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  // ----- Sidebar buttons -----
  document.getElementById('btn-restart').addEventListener('click', () => {
    activeView()?.resetLayout();
  });
  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    activeView()?.resetZoom();
  });
  document.getElementById('btn-reset').addEventListener('click', () => Cart.resetAll());

  document.getElementById('toggle-labels').addEventListener('change', (e) => {
    Cart.setShowLabels(e.target.checked);
  });

  const rotateToggle = document.getElementById('toggle-rotate');
  if (rotateToggle) {
    rotateToggle.addEventListener('change', (e) => {
      window.View3D.setAutoRotate(e.target.checked);
    });
  }

  document.getElementById('path-mode-toggle').addEventListener('change', (e) => {
    Cart.setPathMode(e.target.checked);
  });

  document.getElementById('sidebar-collapse').addEventListener('click', () => Cart.setSidebar(true));
  document.getElementById('sidebar-expand').addEventListener('click', () => Cart.setSidebar(false));

  // ----- Upload JSON (button + drag/drop) -----
  const uploadBtn = document.getElementById('upload-btn');
  const uploadInput = document.getElementById('upload-input');
  uploadBtn.addEventListener('click', () => uploadInput.click());
  uploadInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) ingestFile(file);
    uploadInput.value = '';  // allow re-uploading the same filename
  });

  // Drag-and-drop on the canvas — drop a .json anywhere.
  const dropTarget = document.getElementById('canvas');
  let dropOverlay = null;
  function showDropOverlay() {
    if (dropOverlay) return;
    dropOverlay = document.createElement('div');
    dropOverlay.className = 'drop-overlay';
    dropOverlay.textContent = 'Drop a cartographer JSON snapshot to load it';
    dropTarget.appendChild(dropOverlay);
  }
  function hideDropOverlay() {
    dropOverlay?.remove();
    dropOverlay = null;
  }
  ['dragenter', 'dragover'].forEach(ev => {
    dropTarget.addEventListener(ev, (e) => {
      if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return;
      e.preventDefault();
      showDropOverlay();
    });
  });
  ['dragleave', 'dragend'].forEach(ev => {
    dropTarget.addEventListener(ev, (e) => {
      // Only hide when leaving the overlay/canvas, not when entering a child.
      if (e.target === dropTarget || e.target === dropOverlay) hideDropOverlay();
    });
  });
  dropTarget.addEventListener('drop', (e) => {
    e.preventDefault();
    hideDropOverlay();
    const file = e.dataTransfer?.files?.[0];
    if (file) ingestFile(file);
  });

  async function ingestFile(file) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      Cart.registerJsonMap(json, file.name);
    } catch (err) {
      console.error(err);
      alert('Could not load ' + file.name + ':\n' + err.message);
    }
  }

  // ----- Mode toggle -----
  document.querySelectorAll('.mode-switch button').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });

  // ----- Theme toggle -----
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // ----- 3D tool stack -----
  document.getElementById('tool-zoom-in').addEventListener('click', () => window.View3D.zoomIn());
  document.getElementById('tool-zoom-out').addEventListener('click', () => window.View3D.zoomOut());
  const panBtn = document.getElementById('tool-pan');
  panBtn.addEventListener('click', () => {
    const on = window.View3D.togglePanMode();
    panBtn.classList.toggle('active', on);
  });
  const gridBtn = document.getElementById('tool-grid');
  gridBtn.classList.add('active');  // grid starts visible
  gridBtn.addEventListener('click', () => {
    const on = window.View3D.toggleGrid();
    gridBtn.classList.toggle('active', on);
  });

  // React to OS-level theme changes if the user hasn't explicitly chosen.
  if (!localStorage.getItem(THEME_KEY) && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      if (!localStorage.getItem(THEME_KEY)) applyTheme(e.matches ? 'light' : 'dark');
    });
  }

  // ----- Boot -----
  function boot() {
    // Apply theme before any view boots so the 3D scene starts in the right
    // background color.
    applyTheme(theme);

    Cart.setActiveView(activeView());
    Cart.renderMapDropdown();

    const maps = Cart.availableMaps();
    if (maps.length === 0) {
      // No data file loaded — viewer is standalone. Show the empty hint and
      // wait for the user to upload a JSON snapshot.
      Cart.renderInfo();
      activeView().activate();
      updateModeToggleUI();
      return;
    }
    const fromHash = location.hash.slice(1);
    const initialId = (fromHash && window.MAPS[fromHash]) ? fromHash : maps[0].id;
    Cart.loadMap(initialId);  // populates state + calls activeView.refresh()
    activeView().activate();
    updateModeToggleUI();
  }

  boot();
})();
