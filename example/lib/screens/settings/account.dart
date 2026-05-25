import 'package:flutter/material.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(
        children: const [
          ListTile(title: Text('Change email')),
          ListTile(title: Text('Change password')),
          ListTile(title: Text('Delete account')),
        ],
      ),
    );
  }
}
