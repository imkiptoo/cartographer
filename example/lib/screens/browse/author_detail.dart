import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import 'book_list.dart';

class AuthorDetailScreen extends StatelessWidget {
  const AuthorDetailScreen({super.key, required this.author});
  final String author;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(author)),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(author, style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 8),
            const Text('A short biography of the author goes here.'),
            const SizedBox(height: 16),
            FilledButton.tonalIcon(
              icon: const Icon(Icons.library_books),
              label: const Text('More books by this author'),
              onPressed: () => pushScreen(
                context,
                const BookListScreen(
                  category: 'By Author',
                  filter: 'A. Cartwright',
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
