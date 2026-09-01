import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './App.css'
import App from './App.jsx'
import { initSupabase } from './lib/supabase.js'
import { playBtnClick } from './utils/audioEngine.js'

// Boot Supabase early so it can pick up email verification tokens in the URL
initSupabase()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

document.addEventListener('click', (e) => {
  if (e.target.closest('button')) playBtnClick()
}, true)
