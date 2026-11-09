import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Solo para el login (anon key). Sin variables => modo demo.
export const DEMO = !url || !key
export const supabase = DEMO ? null : createClient(url, key)
