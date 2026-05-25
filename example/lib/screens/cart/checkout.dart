import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import 'order_confirmation.dart';
import 'payment_method.dart';

class CheckoutScreen extends StatelessWidget {
  const CheckoutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            ListTile(
              leading: const Icon(Icons.credit_card),
              title: const Text('Payment method'),
              subtitle: const Text('•••• 4242'),
              onTap: () => pushScreen(context, const PaymentMethodScreen()),
            ),
            const Spacer(),
            FilledButton(
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => const OrderConfirmationScreen(),
                ),
              ),
              child: const Text('Place order'),
            ),
          ],
        ),
      ),
    );
  }
}
