import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import '../browse/book_detail.dart';

class OrderDetailScreen extends StatelessWidget {
  const OrderDetailScreen({super.key, required this.orderId});
  final String orderId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('Order $orderId')),
      body: ListView(
        children: [
          const ListTile(title: Text('Cold Constellations'), trailing: Text('\$12.99')),
          const ListTile(title: Text('The Quiet Mechanic'), trailing: Text('\$10.50')),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.refresh),
            title: const Text('Reorder a book'),
            onTap: () => pushScreen(
              context,
              const BookDetailScreen(title: 'Cold Constellations'),
            ),
          ),
        ],
      ),
    );
  }
}
