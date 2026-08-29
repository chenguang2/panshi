// ESLint flat config（ESLint 10 / typescript-eslint 8 / eslint-plugin-vue 10）
import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'test-results/**', 'playwright-report/**', 'src/assets/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    rules: {
      // TypeScript 已由 vue-tsc 负责类型检查，eslint 的 no-undef 对 TS/Vue 产生误报
      'no-undef': 'off',
      // 存量 any 先 warn 渐进清零（见 docs/refactoring-plan Phase 5）
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // 组件名不强制多词（与既有单组件命名兼容）
      'vue/multi-word-component-names': 'off',
      // 集群 Tab 视图按设计原地变更 cluster 对象状态（共享响应式状态模式），
      // 非 props 反模式，关闭误报
      'vue/no-mutating-props': 'off',
    },
  },
  prettier,
)
