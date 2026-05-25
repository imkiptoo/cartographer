import 'dart:convert';

import 'package:cartographer/cartographer.dart';
import 'package:test/test.dart';

void main() {
  group('SitemapResult', () {
    test('toJson() includes all five top-level fields', () {
      final result = SitemapResult(
        categories: [
          {'id': 'auth', 'label': 'Auth', 'color': '#f8961e'},
        ],
        clusterAnchors: {
          'auth': {'fx': 0.2, 'fy': 0.3},
        },
        nodes: [
          {'id': 'LoginScreen', 'label': 'LoginScreen', 'cat': 'auth'},
        ],
        edges: [
          {'src': 'main', 'dst': 'LoginScreen', 'type': 'push'},
        ],
        meta: {'entry': 'main'},
      );
      final json = result.toJson();
      expect(
          json.keys,
          containsAll([
            'categories',
            'clusterAnchors',
            'nodes',
            'edges',
            'meta',
          ]));
    });

    test('fromJson() round-trips through JSON string', () {
      final original = SitemapResult(
        categories: [
          {'id': 'entry', 'label': 'Entry', 'color': '#f9c74f'},
          {'id': 'home', 'label': 'Home', 'color': '#06d6a0'},
        ],
        clusterAnchors: {
          'entry': {'fx': 0.5, 'fy': 0.1},
          'home': {'fx': 0.5, 'fy': 0.5},
        },
        nodes: [
          {'id': 'main', 'label': 'main.dart', 'cat': 'entry'},
          {'id': 'HomeShell', 'label': 'HomeShell', 'cat': 'home'},
        ],
        edges: [
          {'src': 'main', 'dst': 'HomeShell', 'type': 'push'},
        ],
        meta: {'entry': 'main', 'generatedAt': '2026-01-01T00:00:00Z'},
      );

      final encoded = jsonEncode(original.toJson());
      final decoded = SitemapResult.fromJson(
        jsonDecode(encoded) as Map<String, dynamic>,
      );

      expect(decoded.categories, equals(original.categories));
      expect(decoded.nodes, equals(original.nodes));
      expect(decoded.edges, equals(original.edges));
      expect(decoded.meta, equals(original.meta));
      expect(decoded.clusterAnchors['entry']?['fx'], 0.5);
      expect(decoded.clusterAnchors['home']?['fy'], 0.5);
    });

    test('fromJson() tolerates missing optional fields', () {
      final decoded = SitemapResult.fromJson({
        'categories': [
          {'id': 'auth', 'label': 'Auth'},
        ],
        'nodes': [
          {'id': 'LoginScreen', 'label': 'LoginScreen', 'cat': 'auth'},
        ],
        'edges': [],
      });
      expect(decoded.categories.length, 1);
      expect(decoded.nodes.length, 1);
      expect(decoded.edges, isEmpty);
      expect(decoded.clusterAnchors, isEmpty);
      expect(decoded.meta, isEmpty);
    });

    test('fromJson() coerces integer anchor coordinates to doubles', () {
      final decoded = SitemapResult.fromJson({
        'categories': [],
        'nodes': [],
        'edges': [],
        'clusterAnchors': {
          'home': {'fx': 0, 'fy': 1},
        },
      });
      expect(decoded.clusterAnchors['home']?['fx'], 0.0);
      expect(decoded.clusterAnchors['home']?['fy'], 1.0);
    });
  });
}
