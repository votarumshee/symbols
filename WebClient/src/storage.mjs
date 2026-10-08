export function durableStore(initial,persist,onError=()=>{}) {
 const values={...initial};let writes=Promise.resolve(),failure=null;
 function save(){if(failure)throw failure;const payload=JSON.stringify(values);writes=writes.then(()=>persist(payload)).catch(e=>{failure=e;onError(e);throw e;});writes.catch(()=>{});}
 return {getItem:key=>values[key]??null,setItem(key,value){if(failure)throw failure;values[key]=String(value);save();},removeItem(key){if(failure)throw failure;delete values[key];save();},flush:()=>writes};
}
