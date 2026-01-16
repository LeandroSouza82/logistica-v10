(async () => {
    const id = process.argv[2] || '319';
    const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://uqxoadxqcwidxqsfayem.supabase.co';
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxeG9hZHhxY3dpZHhxc2ZheWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0NDUxODksImV4cCI6MjA4NDAyMTE4OX0.q9_RqSx4YfJxlblPS9fwrocx3HDH91ff1zJvPbVGI8w';
    const res = await fetch(`${supabaseUrl}/rest/v1/entregas?id=eq.${id}`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` }
    });
    const j = await res.json();
    console.log(JSON.stringify(j, null, 2));
})();
