import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
const env = readFileSync('.env.local', 'utf8').split('\n').reduce((a,l)=>{ const m=l.match(/^([A-Z_]+)=(.*)$/); if(m) a[m[1]]=m[2]; return a; }, {});
const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const { data } = await c.from('opportunities').select('id, name').limit(5);
console.log(JSON.stringify(data, null, 2));
