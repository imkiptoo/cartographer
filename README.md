# cartographer

[![Pub Version](https://img.shields.io/pub/v/cartographer.svg)](https://pub.dev/packages/cartographer)
[![Pub Points](https://img.shields.io/pub/points/cartographer)](https://pub.dev/packages/cartographer/score)
[![CI](https://github.com/imkiptoo/cartographer/actions/workflows/ci.yml/badge.svg)](https://github.com/imkiptoo/cartographer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Auto-discover and visualize a Flutter app's navigation graph as an interactive sitemap.

Dev-only — never bundled into your release build.

## Install

Cartographer is a CLI tool you point *at* a project, not a library you import. The recommended install is via `dart pub global`:

```bash
dart pub global activate cartographer
```

Then from any Flutter project:

```bash
cartographer --project . --watch
```

> **Note**: cartographer depends on `analyzer ^13.0.0`, which requires `meta ^1.18.0`. The current stable Flutter SDK pins `meta` at an older version, so you cannot currently add cartographer as a `dev_dependencies` entry in a Flutter project's `pubspec.yaml` — pub resolution will fail. Global activation sidesteps the conflict because cartographer resolves its own dependencies independently of your app.

## Use

```bash
cartographer                       # extract current dir, serve, open browser
cartographer --watch               # live-reload on lib/ changes
cartographer --project ../some-app # analyze a different project
cartographer --output map.json     # CI mode: write JSON, no server
cartographer --fixture map.json    # serve a pre-extracted snapshot (fast viewer iteration)
cartographer --port 8765           # pin a port (default: random free port)
cartographer --no-open             # don't auto-open browser
```

You can also drop any cartographer JSON snapshot directly onto the viewer (or pick one with the "Upload JSON…" button) — useful for sharing a snapshot with someone who doesn't have your project source.

## What it detects

- **`runApp(MyApp())`** — sets the entry node.
- **`MaterialApp(home: X)`** (also `CupertinoApp`, `WidgetsApp`) — connects the root widget to its first screen so the entry chain doesn't break.
- **Direct `Navigator.push*` calls** — `push`, `pushReplacement`, `pushAndRemoveUntil` (and named variants) over `MaterialPageRoute`, `CupertinoPageRoute`, or `PageRouteBuilder`.
- **`Navigator.of(context).push(...)`**.
- **Custom navigation helpers** — any top-level function or method that takes a `Widget` parameter and internally calls `Navigator.push*` is automatically recognized. Calls to it are recorded as push edges with the widget arg as the destination. Catches common app patterns like `navigateWithFade(context, screen)` or `pushScreen(context, screen)`.
- **State-class attribution** — pushes performed inside `_MyScreenState` are credited to `MyScreen`.

## Viewer features

- **2D and 3D modes** in a single page; toggle in the top-right. Mode persists across reloads.
- **Light and dark themes** that respect `prefers-color-scheme` by default, with a manual toggle.
- **Path mode** — toggle on, click any node to see the shortest BFS path from the entry chain. The whole reachable graph is colored by depth (green → lime → yellow → amber → orange → red → crimson). Each node's step number renders inside its circle.
- **Filters** — click categories to hide/show.
- **Focus on click** — clicking a node frames it + its direct neighbours.
- **3D extras** — floor grid, orientation gizmo (FRONT/TOP/RIGHT cube), zoom / pan / grid tool stack, auto-rotate toggle.

## Configuration

Drop a `cartographer.yaml` at the project root to customize categories and the layout:

```yaml
categories:
  - id: auth
    label: Authentication
    match: lib/views/auth/    # any file under here gets cat: auth
  - id: home
    label: Home Shell
    match: lib/views/home/

anchors:
  auth: { fx: 0.18, fy: 0.25 }   # fractional canvas coords for the cluster
  home: { fx: 0.50, fy: 0.30 }

exclude:
  - lib/generated/              # skip these files entirely
```

All keys are optional. Without a config, cartographer infers categories from file paths and arranges clusters in a circle.

## What it doesn't (yet)

- Named routes / `MaterialApp.routes` tables.
- `go_router` and `auto_route`.
- Embedded children (one widget inside another's `build()`).
- Runtime-built route tables.

## Example app

`example/` contains a fictional bookstore — 24 screens organized into auth / home / browse / cart / profile / settings flows, with navigation depth 5 and a mix of direct `Navigator.push` and a custom `pushScreen` helper. To visualize it from a checkout of this repo:

```bash
flutter pub get -C example
cartographer --project example --watch
```

You should see 26 nodes and 32 edges across 7 categories.

## License

MIT — see [LICENSE](LICENSE).
