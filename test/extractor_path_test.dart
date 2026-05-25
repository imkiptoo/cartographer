import 'dart:io';

import 'package:cartographer/cartographer.dart';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

void main() {
  group('extractSitemap path handling', () {
    test('accepts a non-normalized relative project path (e.g. ".")', () async {
      // Regression test for 0.2.1: Directory('.').absolute.path is absolute
      // but contains "./", which AnalysisContextCollection rejects.
      // Build a tiny throwaway Flutter-shaped project, then run extract
      // against the relative "./tiny" form to make sure normalization kicks in.
      final tmp = await Directory.systemTemp.createTemp('cart_path_test_');
      try {
        final proj = Directory(p.join(tmp.path, 'tiny'));
        await Directory(p.join(proj.path, 'lib')).create(recursive: true);
        await File(p.join(proj.path, 'pubspec.yaml')).writeAsString('''
name: tiny
description: tiny test fixture
version: 0.0.0
publish_to: none
environment:
  sdk: ^3.4.0
''');
        await File(p.join(proj.path, 'lib', 'main.dart')).writeAsString('''
class A {}
void main() {}
''');

        // The reproduction: relative path that still contains "./" once made
        // absolute. The previous code would explode here.
        final relative = Directory(p.join(tmp.path, './tiny'));
        final result = await extractSitemap(projectRoot: relative);

        expect(result.nodes, isA<List<Map<String, dynamic>>>());
        expect(result.edges, isA<List<Map<String, dynamic>>>());
        // No widgets defined → no nodes detected, but the extractor must not
        // crash on the non-normalized path.
      } finally {
        await tmp.delete(recursive: true);
      }
    });
  });
}
