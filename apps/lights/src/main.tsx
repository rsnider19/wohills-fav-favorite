import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SupabaseProvider } from '@wohills/core'
import './index.css'
import App from './App.tsx'
import { supabase } from './lib/supabase'
import { applyStoredMotion } from './lib/useMotion'

applyStoredMotion()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SupabaseProvider client={supabase}>
      <App />
    </SupabaseProvider>
  </StrictMode>,
)
