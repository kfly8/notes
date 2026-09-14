import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/vite'
import { CSRAdapter } from '@barefootjs/client/csr-adapter'

export default defineConfig({
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: {
        'search-mount': resolve(__dirname, 'src/islands/mount.ts'),
      },
    },
  },
  plugins: [
    barefoot({
      // CSRAdapter の generate() は常に空出力なので templates は指定しない。
      adapter: new CSRAdapter(),
      components: ['./src/islands'],
    }),
  ],
})
