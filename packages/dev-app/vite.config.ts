import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { mechanica } from 'mechanica/plugin'

export default defineConfig({
  plugins: [mechanica(), vue()],
})
