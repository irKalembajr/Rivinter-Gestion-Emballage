export const TYPES = [
 {id:'B65',label:'Emballages 65Cl',short:'65Cl',price:16500,pack:12,bottle:1000},
 {id:'B33N',label:'Emballages 33Cl noir',short:'33Cl noir',price:16500,pack:24,bottle:500},
 {id:'B33V',label:'Emballages 33Cl vert',short:'33Cl vert',price:16500,pack:24,bottle:500},
 {id:'B30CL',label:'Bambi 30Cl',short:'30Cl',price:16500,pack:24,bottle:500},
 {id:'ALE50',label:'Emballages 50Cl',short:'50Cl',price:24500,pack:20,bottle:1000},
 {id:'BAC',label:'Bacs vides',short:'Bacs',price:4500,pack:1,bottle:0}
];
export const KINDS={purchase:'Achat produits',return:'Retour emballages',consignment:'Consignation emballages',bottle_consignment:'Consignation bouteilles',depot_loss:'Perte au dépôt',factory_breakage:'Casse chez Brasimba'};
export const qty=n=>new Intl.NumberFormat('fr-FR',{maximumFractionDigits:2}).format(Number(n)||0);
export const money=n=>`${qty(n)} Fc`;
export const today=()=>new Date().toLocaleDateString('en-CA');
export function monthRange(month){const [y,m]=month.split('-').map(Number);return {start:month+'-01',end:`${month}-${new Date(y,m,0).getDate()}`};}
export function status(n){return n<0?{text:'Brasimba doit à Rivinter',cls:'good'}:n>0?{text:'Rivinter doit à Brasimba',cls:'bad'}:{text:'Position équilibrée',cls:'neutral'};}
export function effects(kind,q){
 if(!Number.isSafeInteger(q)||q<=0)throw Error('La quantité doit être un entier strictement positif.');
 const map={purchase:[q,q,0],return:[-q,-q,0],consignment:[-q,-q,0],bottle_consignment:[0,-q,-q],depot_loss:[-q,0,0],factory_breakage:[0,q,0]};
 if(!map[kind])throw Error('Type de mouvement inconnu.');
 const [depot_delta,balance_delta,bac_delta]=map[kind];return {depot_delta,balance_delta,bac_delta};
}
export function bottleCases(type,count){const t=TYPES.find(t=>t.id===type);if(!t?.bottle||!Number.isSafeInteger(count)||count<=0||count%t.pack)throw Error(`Saisissez des casiers complets (${t?.pack||'?'} bouteilles par casier).`);return {cases:count/t.pack,amount:count*t.bottle};}
export function positions(data,ids,end){
 return TYPES.map(t=>{
  const initial=data.openings.filter(o=>ids.includes(o.location_id)&&o.bremer_id===t.id&&o.date<=end);
  let depot=initial.reduce((s,o)=>s+Number(o.depot),0),balance=initial.reduce((s,o)=>s+Number(o.balance),0);
  for(const m of data.movements.filter(m=>ids.includes(m.location_id)&&m.date<=end)){
   if(m.bremer_id===t.id){depot+=Number(m.depot_delta);balance+=Number(m.balance_delta);}
   if(t.id==='BAC')depot+=Number(m.bac_delta||0);
  }
  return {...t,depot,balance,park:-balance,value:balance*t.price};
 });
}
export function summary(data,ids,start,end){
 const rows=data.movements.filter(m=>ids.includes(m.location_id)&&m.date>=start&&m.date<=end);
 const sum=(kind,bac=false)=>rows.filter(m=>m.kind===kind&&(bac?m.bremer_id==='BAC':m.bremer_id!=='BAC')).reduce((s,m)=>s+Number(m.quantity),0);
 const purchases=sum('purchase'),returns=sum('return');
 return {purchases,returns,bacs:sum('return',true),consignments:sum('consignment')+sum('bottle_consignment'),loss:sum('depot_loss'),breakage:sum('factory_breakage'),gap:purchases-returns,rows};
}
export function normalizeLine(kind,type,count){
 const t=TYPES.find(t=>t.id===type);if(!t)throw Error('Bremer inconnu.');
 const bottle=kind==='bottle_consignment'?bottleCases(type,count):null;
 const q=bottle?bottle.cases:count;
 return {kind,bremer_id:type,quantity:q,bottle_quantity:bottle?count:0,amount:bottle?bottle.amount:q*t.price,...effects(kind,q)};
}
export function demo(){
 const date=today(),month=date.slice(0,7),start=month+'-01';
 const sites=['Beni','Pasisi','Mambasa','Komanda','Oicha','Kasindi','Eringeti','Cantine','Mabalako 1','Mabalako 2','Mununze','Kyanzaba','Mungamba','Mambingi','Usine'].map((name,i)=>({id:'demo-'+i,name,kind:i<6?'Site':'Axe'}));
 const openings=sites.flatMap((s,i)=>TYPES.map((t,j)=>({location_id:s.id,bremer_id:t.id,date:'2000-01-01',depot:j===5?100:400+i*10,balance:j===5?-20:(i===0?-80:0)})));
 const movements=[['purchase','B65',120,0],['return','B65',80,0],['purchase','ALE50',200,1],['return','ALE50',120,1],['consignment','B33N',30,2],['bottle_consignment','B65',24,0],['depot_loss','B30CL',4,3],['factory_breakage','B33V',3,0]].map(([kind,t,q,i],n)=>({id:'demo-op-'+n,op_id:'demo-op-'+n,date:start,location_id:sites[i].id,ref:'EXEMPLE-'+String(n+1).padStart(3,'0'),...normalizeLine(kind,t,q)}));
 return {sites,openings,movements,objectives:sites.map(s=>({location_id:s.id,month,qty:800})),products:TYPES.filter(t=>t.id!=='BAC').map(t=>({id:t.id,name:'Produit exemple '+t.short,bremer_id:t.id,price:43000})),profiles:[],profile:{role:'principal_admin',full_name:'Mode démonstration'},unallocated:true};
}
