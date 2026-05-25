import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import 'book_list.dart';

class CategoryScreen extends StatelessWidget {
  const CategoryScreen({super.key, required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(name)),
      body: ListView(
        children: [
          ListTile(
            title: const Text('Bestsellers'),
            onTap: () => pushScreen(
              context,
              BookListScreen(category: name, filter: 'Bestsellers'),
            ),
          ),
          ListTile(
            title: const Text('New Releases'),
            onTap: () => pushScreen(
              context,
              BookListScreen(category: name, filter: 'New Releases'),
            ),
          ),
          ListTile(
            title: const Text('Editors\' Picks'),
            onTap: () => pushScreen(
              context,
              BookListScreen(category: name, filter: 'Editors\' Picks'),
            ),
          ),
        ],
      ),
    );
  }
}
