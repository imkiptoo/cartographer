import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import 'book_detail.dart';

class BookListScreen extends StatelessWidget {
  const BookListScreen({super.key, required this.category, required this.filter});
  final String category;
  final String filter;

  static const _titles = [
    'The Cartographer\'s Daughter',
    'Lighthouse at Dusk',
    'Cold Constellations',
    'Paper Rivers',
    'The Quiet Mechanic',
    'Glass and Gravity',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('$category · $filter')),
      body: ListView(
        children: [
          for (final t in _titles)
            ListTile(
              leading: const Icon(Icons.book),
              title: Text(t),
              onTap: () => pushScreen(context, BookDetailScreen(title: t)),
            ),
        ],
      ),
    );
  }
}
