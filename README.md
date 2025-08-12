# Greenleaf — Online Service Booking Form (v3, QR-ready)

A lightweight React (Vite) app with TailwindCSS and QR support that replaces barcodes, includes a multi‑step wizard, totals, and printable layout.

## Quick start

```bash
# 1) install deps
npm install

# 2) run locally
npm run dev

# 3) build for production
npm run build
```

Open http://localhost:5173 to test.

## Deploy options

### GitHub Pages (project page)
1. Commit & push to `main`.
2. Keep `vite.config.js` `base: '/'` if deploying to root domain. If deploying as a project page under a subpath, set:
   ```js
   base: '/<your-repo-name>/'
   ```
3. Enable GitHub Pages → Build & deployment → GitHub Actions. The included workflow will build and publish `dist/`.

### Vercel / Netlify
Connect the repo, framework “Vite”. Default build command `vite build`, output `dist`.

## Customize

- Edit `src/App.jsx` for fields/logic.
- The submit action is a placeholder. Replace `onSubmit()` with a `fetch()` to your API if you want to store data or send email.
- Styles: Tailwind utility classes in JSX. Add custom CSS in `src/index.css` if needed.

## License
MIT
