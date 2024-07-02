import love from 'eslint-config-love'

export default [
  {
    ignores: [
      'node_modules/',
      'dist/',
      '.vscode/',
      'src/generated/'
    ]
  },
  {
    ...love,
    files: ["**/*.js", "**/*.ts", "**/*.mjs"]
  },
  {
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/return-await': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/promise-function-async': 'off',
      '@typescript-eslint/only-throw-error': 'off',
      '@typescript-eslint/non-nullable-type-assertion-style': 'off'
    }
  }
]
