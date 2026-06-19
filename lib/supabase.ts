import { createClient } from '@supabase/supabase-js';

// We add 'as string' to guarantee to TypeScript that these will not be undefined
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey);