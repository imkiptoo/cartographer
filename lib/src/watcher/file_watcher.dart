import 'dart:async';
import 'dart:io';

import 'package:watcher/watcher.dart';

/// Watch a directory recursively for `.dart` file changes and emit one
/// debounced event per burst.
///
/// Returns a Stream that emits `void` events; subscribe and trigger a
/// reload on each emission.
class DartFileWatcher {
  DartFileWatcher({
    required this.directory,
    this.debounce = const Duration(milliseconds: 200),
  });

  final Directory directory;
  final Duration debounce;

  final _controller = StreamController<void>.broadcast();
  StreamSubscription<WatchEvent>? _sub;
  Timer? _timer;

  Stream<void> get events => _controller.stream;

  Future<void> start() async {
    final watcher = DirectoryWatcher(directory.path);
    _sub = watcher.events.listen((event) {
      if (!event.path.endsWith('.dart')) return;
      _timer?.cancel();
      _timer = Timer(debounce, () => _controller.add(null));
    });
    await watcher.ready;
  }

  Future<void> stop() async {
    _timer?.cancel();
    await _sub?.cancel();
    await _controller.close();
  }
}
