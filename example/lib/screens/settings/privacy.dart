import 'package:flutter/material.dart';

class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Privacy')),
      body: ListView(
        children: const [
          SwitchListTile(
              value: false,
              onChanged: null,
              title: Text('Personalized recommendations')),
          SwitchListTile(
              value: true, onChanged: null, title: Text('Analytics')),
          ListTile(title: Text('Download my data')),
        ],
      ),
    );
  }
}
