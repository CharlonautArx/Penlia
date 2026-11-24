const path = require('node:path');

module.exports = function ({ types: t }) {
  return {
    name: 'penlia-app-typography',
    visitor: {
      ImportDeclaration(importPath, state) {
        const filename = state.file.opts.filename;
        if (!filename || importPath.node.source.value !== 'react-native' || importPath.node.importKind === 'type') return;
        const root = path.resolve(__dirname, '..', 'src');
        const component = path.join(root, 'components', 'Typography.tsx');
        if (!filename.startsWith(root + path.sep) || filename === component) return;
        const scaled = importPath.node.specifiers.filter((specifier) =>
          t.isImportSpecifier(specifier) && specifier.importKind !== 'type'
          && t.isIdentifier(specifier.imported) && ['Text', 'TextInput'].includes(specifier.imported.name));
        if (!scaled.length) return;
        const target = path.relative(path.dirname(filename), component.slice(0, -4)).split(path.sep).join('/');
        const native = importPath.node.specifiers.filter((specifier) => !scaled.includes(specifier));
        const replacement = t.importDeclaration(scaled, t.stringLiteral(target.startsWith('.') ? target : './' + target));
        if (native.length) {
          importPath.node.specifiers = native;
          importPath.insertAfter(replacement);
        } else importPath.replaceWith(replacement);
      },
    },
  };
};
