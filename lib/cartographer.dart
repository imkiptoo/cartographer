/// Public API for cartographer.
///
/// Most users will invoke cartographer via the CLI (`dart run cartographer`).
/// This library exposes the extractor for programmatic use (e.g., custom CI scripts).
library;

export 'src/extractor/extractor.dart' show extractSitemap, SitemapResult;
