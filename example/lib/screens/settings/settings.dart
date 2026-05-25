import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import 'account.dart';
import 'notifications.dart';
import 'privacy.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          ListTile(
            leading: const Icon(Icons.notifications),
            title: const Text('Notifications'),
            onTap: () => pushScreen(context, const NotificationsScreen()),
          ),
          ListTile(
            leading: const Icon(Icons.person),
            title: const Text('Account'),
            onTap: () => pushScreen(context, const AccountScreen()),
          ),
          ListTile(
            leading: const Icon(Icons.lock),
            title: const Text('Privacy'),
            onTap: () => pushScreen(context, const PrivacyScreen()),
          ),
        ],
      ),
    );
  }
}
