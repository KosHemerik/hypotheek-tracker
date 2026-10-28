/// <reference types="vitest/config" />
import dns from 'node:dns'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// "localhost" als 127.0.0.1 (niet alleen ::1), zodat elke browser de dev-server bereikt.
dns.setDefaultResultOrder('ipv4first')

// HTTPS met een lokaal certificaat: de bank stuurt na toestemming terug naar
// https://localhost:5173/bank/callback (zo geregistreerd bij Enable Banking).
// Voorkeur: eigen certificaat in secrets/ (werkt ook in Safari; zie README). Anders een
// automatisch gegenereerd certificaat.
const certFile = fileURLToPath(new URL('./secrets/localhost-cert.pem', import.meta.url))
const keyFile = fileURLToPath(new URL('./secrets/localhost-key.pem', import.meta.url))
const ownCert = existsSync(certFile) && existsSync(keyFile)

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(ownCert ? [] : [basicSsl()])],
  server: {
    host: 'localhost',
    port: 5173,
    // Niet stilletjes naar een andere poort: dan klopt het terugkeeradres van de bank niet.
    strictPort: true,
    https: ownCert ? { cert: readFileSync(certFile), key: readFileSync(keyFile) } : undefined,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts'],
  },
})
