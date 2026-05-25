import 'dart:io';

/// Open [url] in the user's default browser.
///
/// On failure, prints the URL to stdout so the user can copy it manually.
Future<void> openInBrowser(Uri url) async {
  final cmd = switch (true) {
    _ when Platform.isMacOS => ['open', url.toString()],
    _ when Platform.isLinux => ['xdg-open', url.toString()],
    _ when Platform.isWindows => ['cmd', '/c', 'start', '', url.toString()],
    _ => null,
  };
  if (cmd == null) {
    stdout.writeln('Open in your browser: $url');
    return;
  }
  try {
    final result = await Process.run(cmd.first, cmd.sublist(1));
    if (result.exitCode != 0) {
      stdout.writeln('Open in your browser: $url');
    }
  } catch (_) {
    stdout.writeln('Open in your browser: $url');
  }
}
