# cartographer

Auto-discover and visualize a Flutter app's navigation graph as an interactive sitemap.

Dev-only — never bundled into your release build.

## Install

```yaml
dev_dependencies:
  cartographer:
    git: https://github.com/imkiptoo/cartographer
```

Then:

```bash
dart pub get
```

## Use

```bash
dart run cartographer                      # extract, serve, open in browser
dart run cartographer --watch              # live-reload on lib/ changes
dart run cartographer --output map.json    # CI mode: write JSON, no server
dart run cartographer --port 8765          # pin a port (default: random)
dart run cartographer --no-open            # don't auto-open browser
dart run cartographer --project ../some-app # analyze a different project
```

## What it detects

- `runApp(MyApp())` — sets the entry node.
- `Navigator.push|pushReplacement|pushAndRemoveUntil(context, MaterialPageRoute(builder: (_) => Foo()))` and the Cupertino + PageRouteBuilder variants.
- `Navigator.of(context).push(...)`.
- Custom navigation helpers — any top-level function or method that takes a `Widget` parameter and internally calls `Navigator.push*` is automatically recognized. Calls to it are recorded as push edges with the widget arg as the destination.
- State-class attribution — pushes performed inside `_MyScreenState` are credited to `MyScreen`.

## What it doesn't (yet)

- Named routes / `MaterialApp.routes` tables.
- `go_router` and `auto_route`.
- Embedded children (one widget inside another's `build()`).
- Runtime-built route tables.

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
  auth: { fx: 0.18, fy: 0.25 }   # fractional canvas coords for category cluster
  home: { fx: 0.50, fy: 0.30 }

exclude:
  - lib/generated/              # skip these files entirely
```

All keys are optional. Without a config, cartographer infers categories from file paths and arranges clusters in a circle.

## Example app

`example/` contains a fictional bookstore — 24 screens organized into auth / home / browse / cart / profile / settings flows, with navigation depth up to 5 and a mix of direct `Navigator.push` and a custom `pushScreen` helper. To visualize it:

```bash
flutter pub get -C example
dart run cartographer --project example --watch
```

You should see ~26 nodes and ~31 edges in the viewer.

## Status

Phase 1 + Phase 1.5 complete: extraction + helper detection + watch mode + config. `go_router` and `auto_route` support, plus baseline-diff CI mode, are planned next.
