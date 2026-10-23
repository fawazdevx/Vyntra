import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { uploadImagePlugin } from './plugins/uploadImage'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), uploadImagePlugin()],
})
