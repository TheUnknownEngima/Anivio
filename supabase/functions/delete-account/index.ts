import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function response(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed' });
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return response(401, { error: 'Sign in required' });
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anon || !service) return response(503, { error: 'Account deletion is not configured' });
  const verifier = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await verifier.auth.getUser(authorization.slice(7));
  if (error || !data.user) return response(401, { error: 'Sign in again to delete your account' });
  // The target is always the verified caller. Never accept a user id from the body.
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const deletion = await admin.auth.admin.deleteUser(data.user.id);
  if (deletion.error) return response(409, { error: 'Account could not be deleted. Remove owned storage files first or contact the project maintainer.' });
  return response(200, { deleted: true });
});
