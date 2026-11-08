import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { uploadImagePlugin } from './plugins/uploadImage'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const privateEnv = loadEnv(mode, process.cwd(), 'IMGBB_API_KEY')
  if (privateEnv.IMGBB_API_KEY) process.env.IMGBB_API_KEY = privateEnv.IMGBB_API_KEY

  return {
    plugins: [react(), uploadImagePlugin()],
  }
})
