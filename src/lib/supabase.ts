import { createClient } from '@supabase/supabase-js';

export type Post = {
  id: string;
  name: string;
  message: string;
  created_at: string;
  likes_count: number;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
