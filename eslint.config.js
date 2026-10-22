import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

/* Configuración plana. Los tipos y el esquema generado no se lintean:
   `src/types/database.ts` lo produce `supabase gen types`. */

const tsFiles = ['**/*.ts']
const vueFiles = ['**/*.vue']

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'src/types/database.ts',
      'coverage/**',
      'tools/**',
      'tmp-*.mjs',
    ],
  },
  js.configs.recommended,

  // TypeScript (solo .ts: los .vue usan el parser de Vue con el de TS dentro).
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: tsFiles,
  })),

  // Vue.
  ...pluginVue.configs['flat/recommended'].map((config) => ({
    ...config,
    files: vueFiles,
  })),

  {
    files: ['**/*.{ts,vue}'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },

  {
    files: vueFiles,
    plugins: {
      vue: pluginVue,
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/attributes-order': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/require-default-prop': 'off',
      'vue/require-explicit-emits': 'error',
      'vue/no-v-html': 'error',
    },
  },

  {
    files: ['vite.config.ts', 'eslint.config.js'],
    languageOptions: {
      globals: { process: 'readonly', __dirname: 'readonly' },
    },
  },
]
