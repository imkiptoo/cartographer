/// Public API for cartographer.
///
/// Most users will invoke cartographer via the CLI (`dart run cartographer`).
/// This library exposes the extractor and config types for programmatic use
/// (e.g., custom CI scripts).
library;

export 'src/config.dart' show CartographerConfig, CategoryRule;
export 'src/extractor/extractor.dart'
    show extractSitemap, SitemapResult, ExtractProgress;
