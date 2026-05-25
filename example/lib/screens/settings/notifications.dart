import 'package:flutter/material.dart';

class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: ListView(
        children: const [
          SwitchListTile(value: true, onChanged: null, title: Text('Order updates')),
          SwitchListTile(value: false, onChanged: null, title: Text('New releases')),
          SwitchListTile(value: false, onChanged: null, title: Text('Promotions')),
        ],
      ),
    );
  }
}
