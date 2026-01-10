import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xdsoctyzmsxbhtjehsqd.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkc29jdHl6bXN4Ymh0amVoc3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMjcxMDMsImV4cCI6MjA4MTkwMzEwM30.WjvJ9E52JXJzjnWAocxQsS9vSAZmrndUuAjUKW_pyCk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export default supabase;
