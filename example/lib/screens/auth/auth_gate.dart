import 'package:flutter/material.dart';

import '../../utils/nav.dart';
import '../home/home_shell.dart';
import 'login.dart';

class AuthGateScreen extends StatelessWidget {
  const AuthGateScreen({super.key});

  // Pretend session check. In a real app this would read from storage.
  bool get _signedIn => false;

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_signedIn) {
        replaceWith(context, const HomeShell());
      } else {
        replaceWith(context, const LoginScreen());
      }
    });
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
