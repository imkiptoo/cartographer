import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';

/// Information about a function/method that internally calls Navigator.push*
/// and accepts a Widget as one of its parameters.
///
/// Calls to such helpers count as navigation pushes; the destination is
/// whichever widget the caller passes for the widget parameter.
class HelperInfo {
  HelperInfo({
    required this.name,
    required this.widgetPositions,
    required this.widgetNamedParams,
  });

  final String name;
  final Set<int> widgetPositions;
  final Set<String> widgetNamedParams;
}

/// First-pass visitor: finds every top-level function or instance method that
/// looks like a navigation helper.
class HelperDiscoveryVisitor extends RecursiveAstVisitor<void> {
  final Map<String, HelperInfo> helpers = {};

  static const _widgetTypeNames = {'Widget'};

  @override
  void visitFunctionDeclaration(FunctionDeclaration node) {
    _consider(node.name.lexeme, node.functionExpression.parameters,
        node.functionExpression.body);
    super.visitFunctionDeclaration(node);
  }

  @override
  void visitMethodDeclaration(MethodDeclaration node) {
    _consider(node.name.lexeme, node.parameters, node.body);
    super.visitMethodDeclaration(node);
  }

  void _consider(
    String name,
    FormalParameterList? params,
    FunctionBody body,
  ) {
    if (params == null) return;

    final positions = <int>{};
    final names = <String>{};
    var posIndex = 0;
    for (final p in params.parameters) {
      if (_isWidgetType(p.type)) {
        if (p.isPositional) {
          positions.add(posIndex);
        } else {
          final n = p.name?.lexeme;
          if (n != null) names.add(n);
        }
      }
      if (p.isPositional) posIndex++;
    }

    if (positions.isEmpty && names.isEmpty) return;
    if (!_bodyHasNavigatorPush(body)) return;

    helpers[name] = HelperInfo(
      name: name,
      widgetPositions: positions,
      widgetNamedParams: names,
    );
  }

  bool _isWidgetType(TypeAnnotation? type) {
    if (type is! NamedType) return false;
    return _widgetTypeNames.contains(type.name.lexeme);
  }

  bool _bodyHasNavigatorPush(FunctionBody body) {
    final searcher = _PushSearcher();
    body.accept(searcher);
    return searcher.found;
  }
}

class _PushSearcher extends RecursiveAstVisitor<void> {
  bool found = false;

  static const _pushMethods = {
    'push',
    'pushNamed',
    'pushReplacement',
    'pushReplacementNamed',
    'pushAndRemoveUntil',
    'pushNamedAndRemoveUntil',
  };

  @override
  void visitMethodInvocation(MethodInvocation node) {
    if (found) return;
    if (_pushMethods.contains(node.methodName.name) &&
        _isNavigatorReceiver(node.target)) {
      found = true;
      return;
    }
    super.visitMethodInvocation(node);
  }

  bool _isNavigatorReceiver(Expression? target) {
    if (target == null) return false;
    if (target is SimpleIdentifier && target.name == 'Navigator') return true;
    if (target is MethodInvocation) {
      final t = target.target;
      if (t is SimpleIdentifier && t.name == 'Navigator') return true;
    }
    return false;
  }
}
