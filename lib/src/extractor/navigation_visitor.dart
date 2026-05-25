import 'package:analyzer/dart/ast/ast.dart';
import 'package:analyzer/dart/ast/visitor.dart';
import 'package:path/path.dart' as p;

import 'helper_visitor.dart';

/// AST visitor that finds:
///   * widget classes (subclass of StatelessWidget, StatefulWidget, or common
///     variants like ConsumerWidget/HookWidget),
///   * the root widget passed to `runApp(...)`,
///   * navigation pushes from one widget to another — directly via
///     Navigator.push*, or indirectly via a known [HelperInfo].
class NavigationVisitor extends RecursiveAstVisitor<void> {
  NavigationVisitor({
    required String filePath,
    required String projectRoot,
    this.knownHelpers = const {},
  })  : _filePath = filePath,
        _relativePath = p.relative(filePath, from: projectRoot);

  final String _filePath;
  final String _relativePath;
  final Map<String, HelperInfo> knownHelpers;

  final List<DiscoveredWidget> widgets = [];
  final List<DiscoveredEdge> edges = [];
  String? rootWidget;

  final List<String> _classStack = [];

  static const _widgetBases = {
    'StatelessWidget',
    'StatefulWidget',
    'ConsumerWidget',
    'ConsumerStatefulWidget',
    'HookWidget',
    'HookConsumerWidget',
  };

  static const _pushMethods = {
    'push',
    'pushNamed',
    'pushReplacement',
    'pushReplacementNamed',
    'pushAndRemoveUntil',
    'pushNamedAndRemoveUntil',
  };

  static const _appCtors = {
    'MaterialApp',
    'CupertinoApp',
    'WidgetsApp',
  };

  @override
  void visitClassDeclaration(ClassDeclaration node) {
    final superClause = node.extendsClause?.superclass;
    final superName = superClause?.name.lexeme;
    final className = node.namePart.typeName.lexeme;
    if (superName != null && _widgetBases.contains(superName)) {
      widgets.add(DiscoveredWidget(
        name: className,
        relativePath: _relativePath,
        filePath: _filePath,
      ));
    }
    // For State<MyScreen>, pushes performed in _MyScreenState are attributed
    // to MyScreen.
    var stackEntry = className;
    if (superName == 'State' && superClause?.typeArguments != null) {
      final typeArgs = superClause!.typeArguments!.arguments;
      if (typeArgs.isNotEmpty && typeArgs.first is NamedType) {
        stackEntry = (typeArgs.first as NamedType).name.lexeme;
      }
    }
    _classStack.add(stackEntry);
    super.visitClassDeclaration(node);
    _classStack.removeLast();
  }

  @override
  void visitMethodInvocation(MethodInvocation node) {
    final methodName = node.methodName.name;

    // runApp(SomeWidget()) — top-level call defining the root widget.
    if (methodName == 'runApp' && node.target == null) {
      final args = node.argumentList.arguments;
      if (args.isNotEmpty) {
        final root = _widgetNameFromExpression(args.first.argumentExpression);
        if (root != null) rootWidget = root;
      }
    }

    // Direct Navigator.push.
    if (_pushMethods.contains(methodName) &&
        _isNavigatorReceiver(node.target)) {
      final dst = _extractPushDestination(node.argumentList);
      _record(dst, 'push');
    }

    // Indirect push via a known helper function/method.
    final helper = knownHelpers[methodName];
    if (helper != null) {
      final dst = _destinationFromHelperCall(node.argumentList, helper);
      _record(dst, 'push');
    }

    super.visitMethodInvocation(node);
  }

  @override
  void visitInstanceCreationExpression(InstanceCreationExpression node) {
    final ctorName = node.constructorName.type.name.lexeme;
    if (_appCtors.contains(ctorName)) {
      for (final arg in node.argumentList.arguments) {
        if (arg is NamedArgument && arg.name.lexeme == 'home') {
          final dst = _widgetNameFromExpression(arg.argumentExpression);
          _record(dst, 'push');
        }
      }
    }
    super.visitInstanceCreationExpression(node);
  }

  void _record(String? dst, String type) {
    if (dst == null) return;
    if (_classStack.isEmpty) return;
    edges.add(DiscoveredEdge(src: _classStack.last, dst: dst, type: type));
  }

  String? _destinationFromHelperCall(ArgumentList args, HelperInfo helper) {
    var posIndex = 0;
    for (final arg in args.arguments) {
      if (arg is NamedArgument) {
        if (helper.widgetNamedParams.contains(arg.name.lexeme)) {
          final dst = _widgetNameFromExpression(arg.argumentExpression);
          if (dst != null) return dst;
        }
      } else {
        if (helper.widgetPositions.contains(posIndex)) {
          final dst = _widgetNameFromExpression(arg.argumentExpression);
          if (dst != null) return dst;
        }
        posIndex++;
      }
    }
    return null;
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

  String? _extractPushDestination(ArgumentList args) {
    for (final arg in args.arguments) {
      final dst = _findWidgetInsideRoute(arg.argumentExpression);
      if (dst != null) return dst;
    }
    return null;
  }

  String? _findWidgetInsideRoute(Expression expr) {
    if (expr is! InstanceCreationExpression) return null;
    final ctorName = expr.constructorName.type.name.lexeme;
    final isRouteCtor = ctorName == 'MaterialPageRoute' ||
        ctorName == 'CupertinoPageRoute' ||
        ctorName == 'PageRouteBuilder' ||
        ctorName.endsWith('PageRoute');
    if (!isRouteCtor) return null;
    for (final arg in expr.argumentList.arguments) {
      if (arg is NamedArgument &&
          (arg.name.lexeme == 'builder' || arg.name.lexeme == 'pageBuilder')) {
        final result = _widgetNameFromBuilder(arg.argumentExpression);
        if (result != null) return result;
      }
    }
    return null;
  }

  String? _widgetNameFromBuilder(Expression expr) {
    if (expr is! FunctionExpression) return null;
    final body = expr.body;
    Expression? inner;
    if (body is ExpressionFunctionBody) {
      inner = body.expression;
    } else if (body is BlockFunctionBody) {
      for (final stmt in body.block.statements) {
        if (stmt is ReturnStatement && stmt.expression != null) {
          inner = stmt.expression;
          break;
        }
      }
    }
    return inner == null ? null : _widgetNameFromExpression(inner);
  }

  String? _widgetNameFromExpression(Expression expr) {
    if (expr is InstanceCreationExpression) {
      return expr.constructorName.type.name.lexeme;
    }
    return null;
  }
}

class DiscoveredWidget {
  DiscoveredWidget({
    required this.name,
    required this.relativePath,
    required this.filePath,
  });
  final String name;
  final String relativePath;
  final String filePath;
}

class DiscoveredEdge {
  DiscoveredEdge({
    required this.src,
    required this.dst,
    required this.type,
  });
  final String src;
  final String dst;
  final String type;
}
