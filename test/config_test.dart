import 'dart:io';

import 'package:cartographer/cartographer.dart';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

void main() {
  group('CartographerConfig', () {
    test('empty constant has no rules, anchors, or exclusions', () {
      const cfg = CartographerConfig.empty;
      expect(cfg.categoryRules, isEmpty);
      expect(cfg.anchors, isEmpty);
      expect(cfg.exclude, isEmpty);
      expect(cfg.categoryFor('lib/anywhere.dart'), isNull);
      expect(cfg.isExcluded('lib/anywhere.dart'), isFalse);
      expect(cfg.labelFor('missing'), isNull);
    });

    test('load() returns empty when no cartographer.yaml is present', () async {
      final dir = await Directory.systemTemp.createTemp('cart_cfg_test_');
      try {
        final cfg = await CartographerConfig.load(dir);
        expect(cfg.categoryRules, isEmpty);
        expect(cfg.anchors, isEmpty);
        expect(cfg.exclude, isEmpty);
      } finally {
        await dir.delete(recursive: true);
      }
    });

    test('load() parses categories, anchors, and exclusions', () async {
      final dir = await Directory.systemTemp.createTemp('cart_cfg_test_');
      try {
        await File(p.join(dir.path, 'cartographer.yaml')).writeAsString('''
categories:
  - id: auth
    label: Authentication
    match: lib/views/auth/
  - id: home
    label: Home Shell
    match: lib/views/home/

anchors:
  auth: { fx: 0.2, fy: 0.3 }
  home: { fx: 0.5, fy: 0.4 }

exclude:
  - lib/generated/
  - lib/widgets/
''');
        final cfg = await CartographerConfig.load(dir);

        expect(cfg.categoryRules.length, 2);
        expect(cfg.categoryRules.first.id, 'auth');
        expect(cfg.categoryRules.first.label, 'Authentication');
        expect(cfg.categoryRules.first.match, 'lib/views/auth/');

        expect(cfg.anchors.length, 2);
        expect(cfg.anchors['auth']?.fx, 0.2);
        expect(cfg.anchors['auth']?.fy, 0.3);
        expect(cfg.anchors['home']?.fx, 0.5);

        expect(cfg.exclude, equals(['lib/generated/', 'lib/widgets/']));
      } finally {
        await dir.delete(recursive: true);
      }
    });

    test('categoryFor() matches by prefix; first rule wins on ties', () {
      final cfg = CartographerConfig(
        categoryRules: [
          CategoryRule(id: 'auth', label: 'Auth', match: 'lib/views/auth/'),
          CategoryRule(id: 'home', label: 'Home', match: 'lib/views/'),
        ],
      );
      expect(cfg.categoryFor('lib/views/auth/login.dart'), 'auth');
      expect(cfg.categoryFor('lib/views/home/dash.dart'), 'home');
      expect(cfg.categoryFor('lib/widgets/button.dart'), isNull);
    });

    test('isExcluded() honors prefix matches', () {
      final cfg = CartographerConfig(
        exclude: ['lib/generated/', 'lib/widgets/'],
      );
      expect(cfg.isExcluded('lib/generated/foo.dart'), isTrue);
      expect(cfg.isExcluded('lib/widgets/bar.dart'), isTrue);
      expect(cfg.isExcluded('lib/views/home.dart'), isFalse);
    });

    test('labelFor() returns the configured label or null', () {
      final cfg = CartographerConfig(
        categoryRules: [
          CategoryRule(id: 'auth', label: 'Authentication'),
        ],
      );
      expect(cfg.labelFor('auth'), 'Authentication');
      expect(cfg.labelFor('missing'), isNull);
    });
  });
}
