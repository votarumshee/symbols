document.querySelector('form').onsubmit=async e=>{
 e.preventDefault();const form=e.target,status=document.querySelector('[role=status]'),button=form.querySelector('button');if(button.disabled)return;button.disabled=true;
 try{
  const post=async(path,body,headers={})=>{const r=await fetch('/api/web/v3/'+path,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error?.message??'Не удалось выполнить запрос');return data;};
  const account=await post('account/recover',{code:form.code.value});form.code.value='';
  await post('commands/delete-account',{confirm:true},{'X-Symbols-Account':account.id,'Idempotency-Key':crypto.randomUUID()});
  form.reset();status.textContent='Аккаунт удалён.';
 }catch(err){status.textContent=err.message;}finally{button.disabled=false;}
};
