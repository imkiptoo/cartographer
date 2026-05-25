import 'package:flutter/material.dart';

class PaymentMethodScreen extends StatelessWidget {
  const PaymentMethodScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Payment method')),
      body: ListView(
        children: const [
          ListTile(
            leading: Icon(Icons.credit_card),
            title: Text('Visa •••• 4242'),
            trailing: Icon(Icons.check),
          ),
          ListTile(
            leading: Icon(Icons.account_balance),
            title: Text('PayPal'),
          ),
          ListTile(
            leading: Icon(Icons.add),
            title: Text('Add payment method'),
          ),
        ],
      ),
    );
  }
}
