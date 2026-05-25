import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import 'edit_profile.dart';
import 'order_history.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        children: [
          const ListTile(
            leading: CircleAvatar(child: Text('AB')),
            title: Text('Avery Brooks'),
            subtitle: Text('avery@example.com'),
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.edit),
            title: const Text('Edit profile'),
            onTap: () => pushScreen(context, const EditProfileScreen()),
          ),
          ListTile(
            leading: const Icon(Icons.history),
            title: const Text('Order history'),
            onTap: () => pushScreen(context, const OrderHistoryScreen()),
          ),
        ],
      ),
    );
  }
}
