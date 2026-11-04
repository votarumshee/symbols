const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function wishesScreen({wishes=[],sort='top',nextOffset=null,draft=''}={}){
 return `<section class="v2-page wishes-page"><button class="quiet" data-nav="home">На главную</button>
 <h1>Пожелания людей</h1><p>Предложи новый символ или расскажи, что изменить в игре. Лайки помогают найти самые популярные идеи.</p>
 <form id="wish-form"><label for="wish-text">Что ты хочешь изменить?</label><textarea id="wish-text" name="text" minlength="3" maxlength="1000" required placeholder="Я хочу добавить такой символ…">${esc(draft)}</textarea><small>Можно описать символ словами или добавить его значок в текст.</small><button class="primary" type="submit">Отправить пожелание</button></form>
 <div class="wishes-controls"><label>Показать <select id="wish-sort"><option value="top" ${sort==='top'?'selected':''}>Больше всего лайков</option><option value="new" ${sort==='new'?'selected':''}>Сначала новые</option></select></label><button class="quiet" id="refresh-wishes">Обновить</button></div>
 <h2>${sort==='top'?'Самые популярные пожелания':'Новые пожелания'}</h2><div class="wishes-list">${wishes.map(w=>`<article class="wish-card"><header><strong>${esc(w.nick)}</strong><time datetime="${esc(w.created)}">${esc(new Date(w.created).toLocaleDateString('ru-RU'))}</time></header><p>${esc(w.body)}</p><button class="choice wish-like" data-wish-like="${esc(w.id)}" aria-pressed="${!!w.liked}" aria-label="${w.liked?'Убрать лайк':'Поставить лайк'}">♥ <span>${w.likes}</span></button></article>`).join('')||'<p>Пожеланий пока нет. Предложи первую идею!</p>'}</div>
 ${nextOffset!==null?'<button class="choice" id="more-wishes">Показать ещё</button>':''}</section>`;
}
