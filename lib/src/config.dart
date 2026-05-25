import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:yaml/yaml.dart';

/// Optional configuration loaded from `cartographer.yaml` at the project root.
///
/// Example:
/// ```yaml
/// categories:
///   - id: auth
///     label: Authentication
///     match: lib/views/auth/
///   - id: home
///     label: Home & Tabs
///
/// anchors:
///   auth: { fx: 0.18, fy: 0.18 }
///   home: { fx: 0.50, fy: 0.30 }
///
/// exclude:
///   - lib/generated/
///   - lib/widgets/
/// ```
class CartographerConfig {
  const CartographerConfig({
    this.categoryRules = const [],
    this.anchors = const {},
    this.exclude = const [],
  });

  final List<CategoryRule> categoryRules;
  final Map<String, ({double fx, double fy})> anchors;
  final List<String> exclude;

  static const empty = CartographerConfig();

  /// Look for `cartographer.yaml` in [projectRoot] and load it; return
  /// [empty] if absent.
  static Future<CartographerConfig> load(Directory projectRoot) async {
    final file = File(p.join(projectRoot.path, 'cartographer.yaml'));
    if (!await file.exists()) return empty;
    final raw = await file.readAsString();
    final yaml = loadYaml(raw);
    if (yaml is! YamlMap) return empty;

    final categoryRules = <CategoryRule>[];
    final rawCats = yaml['categories'];
    if (rawCats is YamlList) {
      for (final entry in rawCats) {
        if (entry is YamlMap) {
          final id = entry['id'] as String?;
          final label = entry['label'] as String?;
          final match = entry['match'] as String?;
          if (id == null) continue;
          categoryRules.add(CategoryRule(
            id: id,
            label: label ?? _humanize(id),
            match: match,
          ));
        }
      }
    }

    final anchors = <String, ({double fx, double fy})>{};
    final rawAnchors = yaml['anchors'];
    if (rawAnchors is YamlMap) {
      for (final entry in rawAnchors.entries) {
        final key = entry.key as String?;
        final val = entry.value;
        if (key != null && val is YamlMap) {
          final fx = (val['fx'] as num?)?.toDouble();
          final fy = (val['fy'] as num?)?.toDouble();
          if (fx != null && fy != null) {
            anchors[key] = (fx: fx, fy: fy);
          }
        }
      }
    }

    final exclude = <String>[];
    final rawExclude = yaml['exclude'];
    if (rawExclude is YamlList) {
      for (final e in rawExclude) {
        if (e is String) exclude.add(e);
      }
    }

    return CartographerConfig(
      categoryRules: categoryRules,
      anchors: anchors,
      exclude: exclude,
    );
  }

  /// Return the category id for a file's relative path, or null to defer
  /// to default inference.
  String? categoryFor(String relativePath) {
    for (final rule in categoryRules) {
      if (rule.match == null) continue;
      if (relativePath.startsWith(rule.match!)) return rule.id;
    }
    return null;
  }

  /// Whether [relativePath] should be skipped entirely.
  bool isExcluded(String relativePath) {
    for (final prefix in exclude) {
      if (relativePath.startsWith(prefix)) return true;
    }
    return false;
  }

  String? labelFor(String id) {
    for (final rule in categoryRules) {
      if (rule.id == id) return rule.label;
    }
    return null;
  }
}

class CategoryRule {
  CategoryRule({required this.id, required this.label, this.match});
  final String id;
  final String label;
  final String? match;
}

String _humanize(String id) {
  return id
      .split(RegExp(r'[_\-\s]'))
      .where((s) => s.isNotEmpty)
      .map((s) => s[0].toUpperCase() + s.substring(1))
      .join(' ');
}
