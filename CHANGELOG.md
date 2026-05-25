# Changelog

All notable changes to cartographer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-05-26

### Changed
- README rewritten for the published package: leads with
  `dart pub global activate cartographer` (the right install model for
  a CLI tool, and the only one that works around the analyzer 13 /
  Flutter SDK `meta` pin), surfaces the pub.dev page link, and
  documents the viewer's full feature set (2D/3D, themes, depth
  heatmap, upload + drag-drop).

### Fixed
- CI lint job now installs the Flutter SDK so `dart pub get` resolves
  the nested `example/` pubspec (Dart 3.11+ auto-discovers nested
  packages and the example depends on Flutter).

## [0.1.0] - 2026-05-26

### Added
- Initial extractor: discovers widgets and navigation edges from a Flutter
  app's `lib/` via `package:analyzer`.
- Detects `runApp`, direct `Navigator.push*` calls,
  `MaterialApp(home:)` entry chains, and custom navigation helpers
  (functions that take a `Widget` parameter and internally call
  `Navigator.push*`).
- Attributes pushes performed inside `State<MyScreen>` to `MyScreen`.
- `cartographer.yaml` config for category rules, anchor pins, and
  exclusions.
- Local HTTP server with static viewer assets and a dynamic
  `/data/extracted.js` endpoint.
- `--watch` mode with SSE live reload on `lib/` changes.
- `--fixture` mode that skips extraction and serves a pre-generated
  JSON snapshot — fast iteration on `viewer/*`.
- `--output` mode that writes JSON and exits (CI-friendly).
- ASCII progress bar driven from real file counts.
- Clean SIGINT shutdown that force-closes SSE clients.
- Unified 2D + 3D interactive viewer in a single page.
- Light/dark theme with `prefers-color-scheme` detection and pre-paint
  flash prevention.
- Path-mode depth heatmap: BFS distance from the entry chain colored
  green → lime → yellow → amber → orange → red → crimson.
- Upload JSON snapshot from the viewer (button + drag-and-drop).
- Empty-state hint when the viewer is served standalone (no
  `/data/extracted.js`).
- 3D viewer extras: floor grid, view gizmo, auto-rotate, zoom/pan/grid
  toolstack.
- Bookstore example app with 24 screens and navigation depth 5.
