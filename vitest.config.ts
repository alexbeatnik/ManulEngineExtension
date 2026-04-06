import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    exclude: ['out/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/__mocks__/vscode.ts'),
    },
  },
})
