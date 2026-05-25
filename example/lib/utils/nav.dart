import 'package:flutter/material.dart';

/// Navigation helper — cartographer recognizes calls to this as push edges
/// because the body contains Navigator.push* and `page` is a Widget parameter.
Future<T?> pushScreen<T>(BuildContext context, Widget page) {
  return Navigator.of(context).push<T>(
    MaterialPageRoute<T>(builder: (_) => page),
  );
}

/// Replace the entire stack — also detected as a push edge.
Future<T?> replaceWith<T>(BuildContext context, Widget page) {
  return Navigator.of(context).pushAndRemoveUntil<T>(
    MaterialPageRoute<T>(builder: (_) => page),
    (route) => false,
  );
}
