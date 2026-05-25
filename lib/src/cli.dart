import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:args/args.dart';

import 'extractor/extractor.dart';
import 'progress.dart';
import 'server/browser.dart';
import 'server/package_root.dart';
import 'server/server.dart';
import 'watcher/file_watcher.dart';

const _version = '0.1.0';

Future<void> runCli(List<String> args) async {
  final parser = ArgParser()
    ..addOption(
      'project',
      abbr: 'p',
      help: 'Path to the Flutter project to analyze.',
      defaultsTo: Directory.current.path,
    )
    ..addOption(
      'port',
      help: 'Port to serve on. Use 0 for a random free port.',
      defaultsTo: '0',
    )
    ..addOption(
      'output',
      abbr: 'o',
      help: 'Write extracted JSON to a file and exit (no server).',
    )
    ..addOption(
      'fixture',
      abbr: 'f',
      help: 'Serve a pre-extracted JSON file instead of running the analyzer. '
          'Great for iterating on viewer/* without paying the extraction cost.',
    )
    ..addFlag(
      'open',
      help: 'Open the viewer in your default browser after starting.',
      defaultsTo: true,
      negatable: true,
    )
    ..addFlag(
      'watch',
      abbr: 'w',
      help: 'Watch lib/ and live-reload the viewer on changes.',
      defaultsTo: false,
      negatable: false,
    )
    ..addFlag(
      'help',
      abbr: 'h',
      help: 'Show this help text.',
      negatable: false,
    )
    ..addFlag(
      'version',
      help: 'Print version and exit.',
      negatable: false,
    );

  late final ArgResults opts;
  try {
    opts = parser.parse(args);
  } on FormatException catch (e) {
    stderr.writeln('Error: ${e.message}\n');
    stderr.writeln(parser.usage);
    exitCode = 64;
    return;
  }

  if (opts['help'] as bool) {
    stdout.writeln(
        "cartographer — visualize a Flutter app's navigation graph.\n");
    stdout.writeln('Usage: dart run cartographer [options]\n');
    stdout.writeln(parser.usage);
    return;
  }
  if (opts['version'] as bool) {
    stdout.writeln('cartographer $_version');
    return;
  }

  final fixturePath = opts['fixture'] as String?;
  final projectRoot = Directory(opts['project'] as String);
  if (fixturePath == null && !await projectRoot.exists()) {
    stderr.writeln('Project not found: ${projectRoot.path}');
    exitCode = 66;
    return;
  }
  if (fixturePath != null && !await File(fixturePath).exists()) {
    stderr.writeln('Fixture not found: $fixturePath');
    exitCode = 66;
    return;
  }

  // CI mode: dump JSON and exit.
  final outputPath = opts['output'] as String?;
  if (outputPath != null) {
    stdout.writeln('Extracting sitemap from ${projectRoot.path}');
    final bar = ProgressBar();
    final result = await extractSitemap(
      projectRoot: projectRoot,
      onProgress: bar.update,
    );
    bar.done();
    final file = File(outputPath);
    await file.writeAsString(
      const JsonEncoder.withIndent('  ').convert(result.toJson()),
    );
    stdout.writeln('Wrote ${result.nodes.length} nodes, '
        '${result.edges.length} edges → ${file.path}');
    return;
  }

  // Server mode.
  final port = int.tryParse(opts['port'] as String) ?? 0;
  final viewerDir = await findViewerDir();

  Future<SitemapResult> loadFromFixture() async {
    final raw = await File(fixturePath!).readAsString();
    return SitemapResult.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  }

  SitemapResult cached;
  if (fixturePath != null) {
    stdout.writeln('Loading fixture from $fixturePath');
    cached = await loadFromFixture();
    stdout.writeln(
        'Loaded ${cached.nodes.length} nodes, ${cached.edges.length} edges (no extraction).');
  } else {
    stdout.writeln('Extracting sitemap from ${projectRoot.path}');
    final startupBar = ProgressBar();
    cached = await extractSitemap(
      projectRoot: projectRoot,
      onProgress: startupBar.update,
    );
    startupBar.done();
    stdout.writeln(
        'Found ${cached.nodes.length} nodes, ${cached.edges.length} edges.');
  }

  // Re-extract on every /data/extracted.js request so source edits show up
  // on browser refresh. Skip re-extraction for the very first request to
  // avoid double-work right after startup. Fixture mode never re-extracts;
  // it only re-reads the fixture file when the file watcher fires.
  var firstServe = true;
  final server = SitemapServer(
    viewerDir: viewerDir,
    loadSitemap: () async {
      if (firstServe || fixturePath != null) {
        firstServe = false;
        return cached;
      }
      final bar = ProgressBar();
      cached = await extractSitemap(
        projectRoot: projectRoot,
        onProgress: bar.update,
      );
      bar.done();
      return cached;
    },
  );

  final url = await server.start(port: port);
  stdout.writeln('Cartographer running at $url');

  DartFileWatcher? watcher;
  StreamSubscription<FileSystemEvent>? fixtureSub;
  if (opts['watch'] as bool) {
    if (fixturePath != null) {
      // Watch the fixture file itself. Reload data + push SSE on change.
      fixtureSub = File(fixturePath).watch().listen((_) async {
        try {
          cached = await loadFromFixture();
          stdout.writeln('Fixture changed — reloading viewer.');
          server.broadcastReload();
        } catch (e) {
          stderr.writeln('Failed to reload fixture: $e');
        }
      });
      stdout.writeln('Watching $fixturePath for changes.');
    } else {
      watcher = DartFileWatcher(
        directory: Directory('${projectRoot.path}/lib'),
      );
      watcher.events.listen((_) {
        stdout.writeln('Source changed — reloading viewer.');
        server.broadcastReload();
      });
      await watcher.start();
      stdout.writeln('Watching lib/ for changes.');
    }
  }
  stdout.writeln('Press Ctrl-C to stop.');

  if (opts['open'] as bool) {
    await openInBrowser(url);
  }

  final done = Completer<void>();
  late final StreamSubscription<ProcessSignal> sigintSub;
  sigintSub = ProcessSignal.sigint.watch().listen((_) async {
    stdout.writeln('\nStopping.');
    await sigintSub.cancel();
    await watcher?.stop();
    await fixtureSub?.cancel();
    await server.stop();
    if (!done.isCompleted) done.complete();
  });
  await done.future;
  // Force-exit so any lingering keep-alive sockets or analyzer isolates
  // don't keep us alive past the explicit Ctrl-C.
  exit(0);
}
