import 'dart:io';

/// Single-line ASCII progress bar. Writes to stdout using carriage returns
/// so the line updates in place. No-ops when stdout is not a terminal
/// (e.g., when output is piped or redirected).
class ProgressBar {
  ProgressBar();

  bool _active = false;

  void update(String phase, int current, int total) {
    if (!stdout.hasTerminal) return;
    final width = stdout.terminalColumns.clamp(40, 100);
    final reserved = phase.length + 24; // " [..] 100%  9999/9999  ()"
    final barWidth = (width - reserved).clamp(10, 60);
    final pct = total == 0 ? 1.0 : current / total;
    final filled = (barWidth * pct).round().clamp(0, barWidth);
    final bar = '█' * filled + '░' * (barWidth - filled);
    final percentInt = (pct * 100).round();
    stdout.write('\r  [$bar] $percentInt%  $current/$total  ($phase)');
    _active = true;
  }

  /// Finalize the current line and move to the next. Safe to call without
  /// a prior [update].
  void done() {
    if (_active && stdout.hasTerminal) {
      stdout.write('\n');
    }
    _active = false;
  }
}
