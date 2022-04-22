function isTopLevel(node){
  let scope = node.parent;
  while (scope.type === 'BlockStatement'){
    scope = scope.parent;
  }
  return (scope.type === 'Program');
}

function defaultReport(node, context) {
  context.report({
    node,
    message: `Side effects on the top level of the module are not allowed.`,
  })
}

function isIdentifier(node, name) {
  return node.type === 'Identifier' && (name === undefined || node.name === name);
}

function isFunctionCall(node, functionName) {
  return node.type === 'CallExpression' && isIdentifier(node.callee, functionName);
}

function isMemberExpression(node, objectName, propertyName) {
  return node.type === 'MemberExpression' &&
    isIdentifier(node.object, objectName) &&
    isIdentifier(node.property, propertyName);
}

function isMemberFunctionCall(node, objectName, functionName) {
  return node.type === 'CallExpression' && isMemberExpression(node.callee, objectName, functionName);
}

function isPlainRequireCall(node) {
  return isFunctionCall(node, 'require');
}

function isSelectiveRequireCall(node) {
  return node.type === 'CallExpression' &&
         node.callee.type === 'MemberExpression' &&
         isPlainRequireCall(node.callee.object);
}

function isCommonJSImport(node) {
  return node.declarations.every((declaration) => {
    const { init } = declaration;
    if (isPlainRequireCall(init)) {
      return true; // const module = require(...);
    }

    if (isSelectiveRequireCall(init)) {
      return true; // const module = require(...).property;
    }

    return false;
  });
}

function isSafeDeclaration(node) {
  return node.declarations.every((declaration) => {
    const { init } = declaration;
    return init.type === 'ArrowFunctionExpression' ||
           init.type === 'FunctionExpression' ||
           init.type === 'Literal' ||
           init.type === 'TemplateLiteral' ||
           isFunctionCall(init, 'Symbol') ||
           isMemberFunctionCall(init, 'Object', 'freeze');
  });
}

module.exports = {
  rules: {
    'no-module-side-effect': (context) => {
      const createSideEffectCheck = (callback = defaultReport) =>
        (node) => isTopLevel(node) && callback(node, context);

      return {
        IfStatement: createSideEffectCheck(),
        ForStatement: createSideEffectCheck(),
        WhileStatement: createSideEffectCheck(),
        SwitchStatement: createSideEffectCheck(),
        ExpressionStatement: createSideEffectCheck((node) => {
          if (node.expression.type === 'AssignmentExpression') {
            if (isMemberExpression(node.expression.left, 'module', 'exports')) {
              return;
            }

            if (isMemberExpression(node.expression.left, 'exports')) {
              return;
            }
          }

          return defaultReport(node, context);
        }),
        VariableDeclaration: createSideEffectCheck((node) => {
          if (node.kind === "const" && (isCommonJSImport(node) || isSafeDeclaration(node))) {
            return;
          }

          context.report({
            node,
            message: `Unexpected variable declaration on the top level of the module - the module might be stateful.`,
          });
        }),
      };
    },
  },
};
