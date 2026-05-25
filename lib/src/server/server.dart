import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;

import '../extractor/extractor.dart';

/// Serves the cartographer viewer over HTTP.
///
/// Routes:
///   GET /                    → viewer/index.html
///   GET /index-3d.html       → viewer/index-3d.html
///   GET /data/extracted.js   → live-extracted sitemap, rendered as IIFE
///   GET /<anything else>     → static file from viewer/
class SitemapServer {
  SitemapServer({
    required this.viewerDir,
    required this.loadSitemap,
  });

  final Directory viewerDir;
  final Future<SitemapResult> Function() loadSitemap;

  HttpServer? _server;
  final Set<HttpResponse> _sseClients = {};

  /// Push a `reload` event to every connected viewer.
  void broadcastReload() {
    final dead = <HttpResponse>[];
    for (final client in _sseClients) {
      try {
        client.write('event: reload\ndata: 1\n\n');
      } catch (_) {
        dead.add(client);
      }
    }
    _sseClients.removeAll(dead);
  }

  Future<Uri> start({int port = 0}) async {
    _server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
    _server!.listen(_handle);
    return Uri.parse('http://localhost:${_server!.port}/');
  }

  Future<void> stop() async {
    for (final client in _sseClients.toList()) {
      try {
        await client.close();
      } catch (_) {}
    }
    _sseClients.clear();
    await _server?.close(force: true);
    _server = null;
  }

  Future<void> _handle(HttpRequest req) async {
    try {
      final path = req.uri.path;
      if (path == '/' || path == '/index.html') {
        await _serveStatic(req, 'index.html');
      } else if (path == '/data/extracted.js') {
        await _serveData(req);
      } else if (path == '/events') {
        await _serveEvents(req);
      } else {
        final rel = path.startsWith('/') ? path.substring(1) : path;
        if (rel.contains('..') || rel.isEmpty) {
          req.response.statusCode = HttpStatus.badRequest;
        } else {
          await _serveStatic(req, rel);
        }
        await req.response.close();
      }
    } catch (e, st) {
      stderr.writeln('Error handling ${req.uri}: $e\n$st');
      try {
        req.response.statusCode = HttpStatus.internalServerError;
        await req.response.close();
      } catch (_) {}
    }
  }

  Future<void> _serveStatic(HttpRequest req, String relativePath) async {
    final file = File(p.join(viewerDir.path, relativePath));
    if (!await file.exists()) {
      req.response.statusCode = HttpStatus.notFound;
      await req.response.close();
      return;
    }
    req.response.headers.contentType = ContentType.parse(_contentType(file.path));
    req.response.headers.add('Cache-Control', 'no-store');
    await req.response.addStream(file.openRead());
    await req.response.close();
  }

  Future<void> _serveEvents(HttpRequest req) async {
    final res = req.response;
    res.statusCode = HttpStatus.ok;
    res.headers.set('Content-Type', 'text/event-stream');
    res.headers.set('Cache-Control', 'no-cache');
    res.headers.set('Connection', 'keep-alive');
    res.write(': cartographer SSE stream open\n\n');
    _sseClients.add(res);
    // Keep the response alive; close it only when the client goes away.
    final done = Completer<void>();
    req.response.done.whenComplete(() {
      _sseClients.remove(res);
      if (!done.isCompleted) done.complete();
    });
    await done.future;
  }

  Future<void> _serveData(HttpRequest req) async {
    final data = await loadSitemap();
    final js = _renderIife(data);
    req.response.headers.contentType =
        ContentType.parse('application/javascript');
    req.response.headers.add('Cache-Control', 'no-store');
    req.response.write(js);
    await req.response.close();
  }

  String _renderIife(SitemapResult data) {
    final json = jsonEncode(data.toJson());
    return '''(function(){
const data = $json;
(window.MAPS = window.MAPS || {})['extracted'] = {
  id: 'extracted',
  label: 'Extracted',
  CATEGORIES: data.categories,
  CLUSTER_ANCHORS: data.clusterAnchors,
  NODES: data.nodes,
  EDGES: data.edges,
};
})();''';
  }

  String _contentType(String filePath) {
    switch (p.extension(filePath).toLowerCase()) {
      case '.html':
        return 'text/html; charset=utf-8';
      case '.js':
        return 'application/javascript; charset=utf-8';
      case '.css':
        return 'text/css; charset=utf-8';
      case '.json':
        return 'application/json; charset=utf-8';
      case '.svg':
        return 'image/svg+xml';
      case '.png':
        return 'image/png';
      case '.ico':
        return 'image/x-icon';
      default:
        return 'application/octet-stream';
    }
  }
}
