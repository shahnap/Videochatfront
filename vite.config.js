import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs';
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    
    host: '0.0.0.0', // Allow connections from all network interfaces
  }
})
