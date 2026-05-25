import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import '../browse/browse.dart';
import '../cart/cart.dart';
import '../profile/profile.dart';
import '../settings/settings.dart';

class HomeShell extends StatelessWidget {
  const HomeShell({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Inkwell Books'),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () => pushScreen(context, const SettingsScreen()),
          ),
        ],
      ),
      body: GridView.count(
        crossAxisCount: 2,
        padding: const EdgeInsets.all(16),
        children: [
          _Tile(
            icon: Icons.menu_book,
            label: 'Browse',
            onTap: () => pushScreen(context, const BrowseScreen()),
          ),
          _Tile(
            icon: Icons.shopping_cart,
            label: 'Cart',
            onTap: () => pushScreen(context, const CartScreen()),
          ),
          _Tile(
            icon: Icons.person,
            label: 'Profile',
            onTap: () => pushScreen(context, const ProfileScreen()),
          ),
          _Tile(
            icon: Icons.settings,
            label: 'Settings',
            onTap: () => pushScreen(context, const SettingsScreen()),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap,
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 48),
            const SizedBox(height: 8),
            Text(label),
          ],
        ),
      ),
    );
  }
}
