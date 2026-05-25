import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import 'checkout.dart';

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cart')),
      body: ListView(
        children: const [
          ListTile(title: Text('Lighthouse at Dusk'), trailing: Text('\$14.99')),
          ListTile(title: Text('Paper Rivers'), trailing: Text('\$11.50')),
        ],
      ),
      bottomNavigationBar: Padding(
        padding: const EdgeInsets.all(16),
        child: FilledButton(
          onPressed: () => pushScreen(context, const CheckoutScreen()),
          child: const Text('Checkout'),
        ),
      ),
    );
  }
}
