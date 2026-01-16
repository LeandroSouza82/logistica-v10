(async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://uqxoadxqcwidxqsfayem.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeG9hZHhxY3dpZHhxc2ZheWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NDUxODksImV4cCI6MjA4NDAyMTE4OX0.q9_RqSx4YfJxlblPS9fwrocx3HDH91ff1zJvPbVGI8w';
    const id = process.argv[2] || '321';
    const res = await fetch(`${supabaseUrl}/rest/v1/entregas?id=eq.${id}`, { method: 'DELETE', headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
    console.log('status', res.status);
})();
