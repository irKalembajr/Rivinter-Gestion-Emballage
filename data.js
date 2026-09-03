import {createClient} from '@supabase/supabase-js';
import {TYPES} from './engine.js';
const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const db=url&&key?createClient(url,key):null;
export const requireOk=r=>{if(r.error)throw Error(r.error.message);return r.data;};
export async function all(table,order='id'){
 const rows=[];
 for(let from=0;;from+=1000){let q=db.from(table).select('*');for(const c of order.split(','))q=q.order(c);const page=requireOk(await q.range(from,from+999));rows.push(...page);if(page.length<1000)return rows;}
}
export async function load(){
 const user=requireOk(await db.auth.getUser()).user;
 const profile=requireOk(await db.from('profiles').select('*').eq('id',user.id).single());
 if(!profile.active)throw Error('Ce compte est désactivé.');
 const admin=['admin','principal_admin'].includes(profile.role);
 const [sites0,products,initial,global,objectives,movements,operations,settings,profiles,prices]=await Promise.all([
  all('locations'),all('products'),all('initial_stocks','scope,location_id,bremer_id'),admin?all('global_factory_initial','bremer_id'):[],all('objectives','month,location_id'),all('riv_ledger','id'),all('riv_operations','id'),admin?all('app_settings','key'):[],admin?all('profiles'):[],all('product_prices','product_id,location_id')]);
 const sites=admin?sites0:sites0.filter(s=>s.id===profile.location_id);
 const openings=sites.flatMap(s=>TYPES.map(t=>({location_id:s.id,bremer_id:t.id,date:'0001-01-01',depot:Number(initial.find(o=>o.location_id===s.id&&o.bremer_id===t.id&&o.scope==='depot')?.quantity||0),balance:-Number(initial.find(o=>o.location_id===s.id&&o.bremer_id===t.id&&o.scope==='factory')?.quantity||0)})));
 let unallocated=false;
 if(admin){const extra=TYPES.map(t=>({location_id:'__unallocated__',bremer_id:t.id,date:'0001-01-01',depot:0,balance:-(Number(global.find(o=>o.bremer_id===t.id)?.quantity||0)-initial.filter(o=>o.bremer_id===t.id&&o.scope==='factory').reduce((n,o)=>n+Number(o.quantity),0))}));
  if(extra.some(o=>o.balance!==0)){unallocated=true;sites.push({id:'__unallocated__',name:'Report global non affecté',kind:'À affecter'});openings.push(...extra);}}
 const visible=new Set(sites.map(s=>s.id));
 return {sites,products,openings,objectives,movements:movements.filter(m=>visible.has(m.location_id)),operations,profile,profiles,prices,unallocated,locked:Boolean(settings.find(s=>s.key==='initial_stock')?.value?.locked)};
}
export async function postOperation(payload){return requireOk(await db.rpc('riv_post_operation',{p:payload}));}
export async function cancelOperation(id,reason){return requireOk(await db.rpc('riv_cancel_operation',{p_id:id,p_reason:reason}));}
export async function saveOpening(site,rows){return requireOk(await db.rpc('riv_save_opening',{p_site:site,p_rows:rows}));}
export async function saveSite(id,name,kind){return requireOk(await db.from('locations').upsert({id,name,kind}));}
export async function saveGoal(location_id,month,qty){return requireOk(await db.from('objectives').upsert({location_id,month,qty},{onConflict:'month,location_id'}));}
export async function saveProfile(id,changes){return requireOk(await db.from('profiles').update(changes).eq('id',id));}
export async function invite(payload){const {data}=await db.auth.getSession();const r=await fetch('/api/invite-user',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify(payload)});let json;try{json=await r.json()}catch{throw Error('Création de compte disponible sur le déploiement Vercel avec la fonction serveur configurée.')}if(!r.ok)throw Error(json.error||'Création impossible.');return json;}
