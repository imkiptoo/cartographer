import 'package:flutter/material.dart';

class ChapterPreviewScreen extends StatelessWidget {
  const ChapterPreviewScreen({super.key, required this.bookTitle});
  final String bookTitle;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Preview — $bookTitle')),
      body: const SingleChildScrollView(
        padding: EdgeInsets.all(16),
        child: Text(
          'Sample text goes here. It was a bright cold day in April, '
          'and the clocks were striking thirteen...',
        ),
      ),
    );
  }
}
