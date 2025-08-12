import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// If you deploy to GitHub Pages as a *project page*, set base to '/<repo-name>/'.
// Example: base: '/greenleaf-booking-form/'
// If deploying to a custom domain or user/org page root, leave as '/'.
export default defineConfig({
  plugins: [react()],
  base: '/'
})
