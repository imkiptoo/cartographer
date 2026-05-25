import 'dart:io';
import 'dart:isolate';

import 'package:path/path.dart' as p;

/// Locate the cartographer package's `viewer/` directory at runtime.
///
/// Works whether cartographer is installed as a git dependency, path
/// dependency, or from pub.dev — uses the package_config to find where
/// pub has placed the package on disk.
Future<Directory> findViewerDir() async {
  final uri = await Isolate.resolvePackageUri(
    Uri.parse('package:cartographer/cartographer.dart'),
  );
  if (uri == null) {
    throw StateError(
      'Could not resolve package:cartographer. '
      'Is cartographer listed as a dependency?',
    );
  }
  final libFile = File.fromUri(uri);
  final packageRoot = libFile.parent.parent;
  final viewerDir = Directory(p.join(packageRoot.path, 'viewer'));
  if (!viewerDir.existsSync()) {
    throw StateError('Viewer directory not found at ${viewerDir.path}');
  }
  return viewerDir;
}
