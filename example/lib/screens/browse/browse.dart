import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import 'category.dart';

class BrowseScreen extends StatelessWidget {
  const BrowseScreen({super.key});

  static const _categories = [
    'Fiction',
    'Non-Fiction',
    'Mystery',
    'Sci-Fi',
    'Biography',
    'Poetry',
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Browse')),
      body: ListView(
        children: [
          for (final c in _categories)
            ListTile(
              leading: const Icon(Icons.category),
              title: Text(c),
              onTap: () => pushScreen(context, CategoryScreen(name: c)),
            ),
        ],
      ),
    );
  }
}
