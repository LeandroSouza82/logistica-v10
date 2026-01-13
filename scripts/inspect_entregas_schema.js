import { createClient } from '@supabase/supabase-js';
(async function () {
    let supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://xdsoctyzmsxbhtjehsqd.supabase.co';
    let supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhkc29jdHl6bXN4Ymh0amVoc3FkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYzMjcxMDMsImV4cCI6MjA4MTkwMzEwM30.WjvJ9E52JXJzjnWAocxQsS9vSAZmrndUuAjUKW_pyCk';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase.from('entregas').select('*').limit(1);
    if (error) {
        console.error('Error fetching entregas sample:', error);
        process.exit(1);
    }
    if (!data || data.length === 0) {
        console.log('No entregas rows found.');
        process.exit(0);
    }
    const row = data[0];
    console.log('Entregas sample keys:', Object.keys(row).join(', '));
    console.log('Sample row:', row);
})();