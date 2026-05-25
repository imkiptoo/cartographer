import 'dart:io';
import 'dart:math' as math;

import 'package:analyzer/dart/analysis/analysis_context_collection.dart';
import 'package:analyzer/dart/analysis/results.dart';
import 'package:path/path.dart' as p;

import '../config.dart';
import 'helper_visitor.dart';
import 'navigation_visitor.dart';

/// Result of extracting a sitemap from a Flutter project.
class SitemapResult {
  SitemapResult({
    required this.categories,
    required this.clusterAnchors,
    required this.nodes,
    required this.edges,
    required this.meta,
  });

  final List<Map<String, dynamic>> categories;
  final Map<String, Map<String, double>> clusterAnchors;
  final List<Map<String, dynamic>> nodes;
  final List<Map<String, dynamic>> edges;
  final Map<String, dynamic> meta;

  Map<String, dynamic> toJson() => {
        'categories': categories,
        'clusterAnchors': clusterAnchors,
        'nodes': nodes,
        'edges': edges,
        'meta': meta,
      };

  factory SitemapResult.fromJson(Map<String, dynamic> json) {
    final rawAnchors = json['clusterAnchors'] as Map<String, dynamic>? ?? {};
    final anchors = <String, Map<String, double>>{};
    rawAnchors.forEach((k, v) {
      if (v is Map) {
        anchors[k] = {
          'fx': (v['fx'] as num).toDouble(),
          'fy': (v['fy'] as num).toDouble(),
        };
      }
    });
    return SitemapResult(
      categories: ((json['categories'] as List?) ?? [])
          .cast<Map<String, dynamic>>()
          .toList(),
      clusterAnchors: anchors,
      nodes: ((json['nodes'] as List?) ?? [])
          .cast<Map<String, dynamic>>()
          .toList(),
      edges: ((json['edges'] as List?) ?? [])
          .cast<Map<String, dynamic>>()
          .toList(),
      meta: (json['meta'] as Map<String, dynamic>?) ?? const {},
    );
  }
}

/// Walk [projectRoot]/lib using package:analyzer and produce a sitemap of
/// widget classes and the Navigator pushes between them.
///
/// [onProgress] is invoked as files are processed, with the phase label and
/// the (processed, total) file counts for that phase.
typedef ExtractProgress = void Function(String phase, int current, int total);

Future<SitemapResult> extractSitemap({
  required Directory projectRoot,
  CartographerConfig? config,
  ExtractProgress? onProgress,
}) async {
  final libDir = Directory(p.join(projectRoot.path, 'lib'));
  if (!await libDir.exists()) {
    throw StateError('No lib/ directory found in ${projectRoot.path}');
  }

  final cfg = config ?? await CartographerConfig.load(projectRoot);
  final rootPath = projectRoot.absolute.path;
  final collection = AnalysisContextCollection(
    includedPaths: [libDir.absolute.path],
  );

  bool excluded(String filePath) {
    final rel = p.relative(filePath, from: rootPath);
    return cfg.isExcluded(rel);
  }

  // Collect all dart files upfront so progress totals are exact.
  final allFiles = <(String, dynamic)>[]; // (path, context) pairs
  for (final ctx in collection.contexts) {
    for (final filePath in ctx.contextRoot.analyzedFiles()) {
      if (!filePath.endsWith('.dart')) continue;
      if (excluded(filePath)) continue;
      allFiles.add((filePath, ctx));
    }
  }

  final widgets = <String, _WidgetInfo>{};
  final edges = <_Edge>[];
  String? rootWidget;
  final helpers = <String, HelperInfo>{};

  // Pass 1: discover navigation helpers across the project.
  onProgress?.call('pass 1/2: helpers', 0, allFiles.length);
  for (var i = 0; i < allFiles.length; i++) {
    final (filePath, ctx) = allFiles[i];
    final unit = await ctx.currentSession.getResolvedUnit(filePath);
    if (unit is ResolvedUnitResult) {
      final visitor = HelperDiscoveryVisitor();
      unit.unit.accept(visitor);
      helpers.addAll(visitor.helpers);
    }
    onProgress?.call('pass 1/2: helpers', i + 1, allFiles.length);
  }

  // Pass 2: extract widgets, runApp, and edges (using helpers).
  onProgress?.call('pass 2/2: navigation', 0, allFiles.length);
  for (var i = 0; i < allFiles.length; i++) {
    final (filePath, ctx) = allFiles[i];
    final unit = await ctx.currentSession.getResolvedUnit(filePath);
    if (unit is ResolvedUnitResult) {
      final visitor = NavigationVisitor(
        filePath: filePath,
        projectRoot: rootPath,
        knownHelpers: helpers,
      );
      unit.unit.accept(visitor);

      for (final w in visitor.widgets) {
        widgets[w.name] = _WidgetInfo(
          name: w.name,
          relativePath: w.relativePath,
        );
      }
      edges.addAll(visitor.edges.map((e) => _Edge(
            src: e.src,
            dst: e.dst,
            type: e.type,
          )));
      rootWidget ??= visitor.rootWidget;
    }
    onProgress?.call('pass 2/2: navigation', i + 1, allFiles.length);
  }

  return _buildResult(
    widgets: widgets,
    rawEdges: edges,
    rootWidget: rootWidget,
    config: cfg,
  );
}

SitemapResult _buildResult({
  required Map<String, _WidgetInfo> widgets,
  required List<_Edge> rawEdges,
  required String? rootWidget,
  required CartographerConfig config,
}) {
  final involvedWidgets = <String>{};
  final keptEdges = <_Edge>[];
  for (final e in rawEdges) {
    if (!widgets.containsKey(e.dst)) continue;
    keptEdges.add(e);
    involvedWidgets.add(e.src);
    involvedWidgets.add(e.dst);
  }
  if (rootWidget != null && widgets.containsKey(rootWidget)) {
    involvedWidgets.add(rootWidget);
  }

  final hasEntry = rootWidget != null && widgets.containsKey(rootWidget);
  final nodes = <Map<String, dynamic>>[];
  if (hasEntry) {
    nodes.add({
      'id': 'main',
      'label': 'main.dart',
      'cat': 'entry',
      'file': 'lib/main.dart',
      'size': 8,
    });
  }
  for (final name in involvedWidgets) {
    final w = widgets[name];
    if (w == null) continue;
    nodes.add({
      'id': name,
      'label': name,
      'cat':
          config.categoryFor(w.relativePath) ?? _inferCategory(w.relativePath),
      'file': w.relativePath,
    });
  }

  final edges = <Map<String, dynamic>>[
    if (hasEntry)
      {
        'src': 'main',
        'dst': rootWidget,
        'type': 'push',
      },
    ...keptEdges.map((e) => {
          'src': e.src,
          'dst': e.dst,
          'type': e.type,
        }),
  ];

  final catIds = nodes.map((n) => n['cat'] as String).toSet().toList()..sort();
  if (catIds.remove('entry')) catIds.insert(0, 'entry');

  final categories = <Map<String, dynamic>>[];
  for (var i = 0; i < catIds.length; i++) {
    final id = catIds[i];
    categories.add({
      'id': id,
      'label': config.labelFor(id) ?? _humanize(id),
      'color': _colorFor(id, i),
    });
  }

  // Auto-arrange categories in a circle; explicit anchors from config override.
  final clusterAnchors = <String, Map<String, double>>{};
  for (var i = 0; i < catIds.length; i++) {
    final theta = (i / catIds.length) * 2 * math.pi - math.pi / 2;
    clusterAnchors[catIds[i]] = {
      'fx': 0.5 + 0.35 * math.cos(theta),
      'fy': 0.5 + 0.35 * math.sin(theta),
    };
  }
  if (clusterAnchors.containsKey('entry')) {
    clusterAnchors['entry'] = {'fx': 0.5, 'fy': 0.1};
  }
  for (final entry in config.anchors.entries) {
    if (clusterAnchors.containsKey(entry.key)) {
      clusterAnchors[entry.key] = {'fx': entry.value.fx, 'fy': entry.value.fy};
    }
  }

  return SitemapResult(
    categories: categories,
    clusterAnchors: clusterAnchors,
    nodes: nodes,
    edges: edges,
    meta: {
      'entry': hasEntry ? 'main' : null,
      'generatedAt': DateTime.now().toUtc().toIso8601String(),
      'generator': 'cartographer 0.1.0',
    },
  );
}

String _inferCategory(String relativePath) {
  final parts = p.split(relativePath);
  if (parts.isNotEmpty && parts.first == 'lib') parts.removeAt(0);
  const containers = {'views', 'screens', 'pages', 'features', 'src'};
  for (var i = 0; i < parts.length - 1; i++) {
    if (containers.contains(parts[i])) {
      return parts[i + 1];
    }
  }
  if (parts.length > 1) return parts.first;
  return 'default';
}

/// Pin well-known ids to the viewer's original palette so colors stay
/// consistent across maps that share these categories.
const _pinnedColors = <String, String>{
  'entry': '#f9c74f',
  'auth': '#f8961e',
  'shell': '#f94144',
  'settings': '#9d4edd',
  'animal': '#43aa8b',
  'health': '#f3722c',
  'breeding': '#ec4899',
  'batch': '#4cc9f0',
  'production': '#90be6d',
  'debug': '#6c757d',
};

/// Fallback palette cycled by category index for ids not in [_pinnedColors].
const _palette = <String>[
  '#577590',
  '#277da1',
  '#80b918',
  '#8338ec',
  '#06d6a0',
  '#ef476f',
  '#00afb9',
  '#fb5607',
  '#3a86ff',
  '#ffbe0b',
  '#fb6f92',
  '#c77dff',
];

String _colorFor(String id, int index) {
  return _pinnedColors[id] ?? _palette[index % _palette.length];
}

String _humanize(String id) {
  return id
      .split(RegExp(r'[_\-\s]'))
      .where((s) => s.isNotEmpty)
      .map((s) => s[0].toUpperCase() + s.substring(1))
      .join(' ');
}

class _WidgetInfo {
  _WidgetInfo({required this.name, required this.relativePath});
  final String name;
  final String relativePath;
}

class _Edge {
  _Edge({required this.src, required this.dst, required this.type});
  final String src;
  final String dst;
  final String type;
}
