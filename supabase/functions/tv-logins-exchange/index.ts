import { createClient } from 'npm:@supabase/supabase-js@2';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response(null,{headers});
 if(request.method!=='POST')return reply(405,{error:'Method not allowed'});
 const url=Deno.env.get('SUPABASE_URL'),anon=Deno.env.get('SUPABASE_ANON_KEY'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!anon||!service)return reply(503,{error:'Device sign-in is not configured'});
 let body;try{body=await request.json();}catch{return reply(400,{error:'Invalid request'});}
 if(typeof body.code!=='string'||!/^[a-f0-9]{64}$/.test(body.code)||typeof body.device_nonce!=='string'||body.device_nonce.length>128)return reply(400,{error:'Invalid device challenge'});
 const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
 const admin=createClient(url,service,options);
 const claim=await admin.rpc('consume_device_login',{p_code:body.code,p_device_nonce:body.device_nonce});
 if(claim.error||!claim.data?.[0])return reply(401,{error:'Device approval expired or already used'});
 // Approval is consumed before generating a session. Replays can never mint more sessions.
 const target=claim.data[0];
 const generated=await admin.auth.admin.generateLink({type:'magiclink',email:target.email});
 const hash=generated.data?.properties?.hashed_token;
 if(generated.error||!hash)return reply(503,{error:'Could not finish device sign-in; request a new code'});
 const client=createClient(url,anon,options);
 const verified=await client.auth.verifyOtp({token_hash:hash,type:'email'});
 const session=verified.data.session;
 if(verified.error||!session||session.user.id!==target.user_id)return reply(503,{error:'Could not finish device sign-in; request a new code'});
 return reply(200,{access_token:session.access_token,refresh_token:session.refresh_token,expires_in:session.expires_in,token_type:session.token_type,user:session.user});
});
