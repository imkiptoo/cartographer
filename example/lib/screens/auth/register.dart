import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import '../home/home_shell.dart';

class RegisterScreen extends StatelessWidget {
  const RegisterScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const TextField(decoration: InputDecoration(labelText: 'Name')),
            const TextField(decoration: InputDecoration(labelText: 'Email')),
            const TextField(decoration: InputDecoration(labelText: 'Password')),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => replaceWith(context, const HomeShell()),
              child: const Text('Create account'),
            ),
          ],
        ),
      ),
    );
  }
}
