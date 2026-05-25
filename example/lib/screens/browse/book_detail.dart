import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import 'author_detail.dart';
import 'chapter_preview.dart';

class BookDetailScreen extends StatelessWidget {
  const BookDetailScreen({super.key, required this.title});
  final String title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(title, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => pushScreen(
              context,
              const AuthorDetailScreen(author: 'A. Cartwright'),
            ),
            child: const Text('by A. Cartwright'),
          ),
          const SizedBox(height: 16),
          FilledButton.icon(
            icon: const Icon(Icons.preview),
            label: const Text('Read sample chapter'),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ChapterPreviewScreen(bookTitle: title),
              ),
            ),
          ),
          const SizedBox(height: 8),
          FilledButton.tonalIcon(
            icon: const Icon(Icons.add_shopping_cart),
            label: const Text('Add to cart'),
            onPressed: () {},
          ),
        ],
      ),
    );
  }
}
