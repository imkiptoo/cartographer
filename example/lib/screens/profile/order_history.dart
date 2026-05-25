import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import 'order_detail.dart';

class OrderHistoryScreen extends StatelessWidget {
  const OrderHistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Order history')),
      body: ListView(
        children: [
          for (final id in ['#1042', '#1038', '#1011', '#0973'])
            ListTile(
              title: Text('Order $id'),
              subtitle: const Text('Delivered'),
              onTap: () => pushScreen(context, OrderDetailScreen(orderId: id)),
            ),
        ],
      ),
    );
  }
}
