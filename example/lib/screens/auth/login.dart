import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import '../home/home_shell.dart';
import 'forgot_password.dart';
import 'register.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sign in')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const TextField(decoration: InputDecoration(labelText: 'Email')),
            const TextField(decoration: InputDecoration(labelText: 'Password')),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => replaceWith(context, const HomeShell()),
              child: const Text('Sign in'),
            ),
            TextButton(
              onPressed: () => pushScreen(context, const RegisterScreen()),
              child: const Text('Create account'),
            ),
            TextButton(
              onPressed: () =>
                  pushScreen(context, const ForgotPasswordScreen()),
              child: const Text('Forgot password?'),
            ),
          ],
        ),
      ),
    );
  }
}
