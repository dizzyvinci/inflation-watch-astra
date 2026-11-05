(() => {
  'use strict';
  const section=document.getElementById('category-section'),link=section?.querySelector('.category-basket-link'),heading=section?.querySelector('.category-section-heading'),cards=document.getElementById('category-cards');
  if(!link||!heading||!cards||document.getElementById('category-link-options'))return;
  const key='astra-category-link-position-v1',modes=new Set(['categories','headline','cash']);let selected='categories';try{const saved=localStorage.getItem(key);if(modes.has(saved))selected=saved}catch{}
  const group=document.createElement('div');group.id='category-link-options';group.className='category-value-options';group.dataset.previewControls='true';group.setAttribute('role','group');group.setAttribute('aria-label','Representative items link position');
  const label=document.createElement('span');label.textContent='Representative items link';group.append(label);
  function apply(){const cash=document.getElementById('cash-item-highlights');if(selected==='headline')heading.append(link);else if(selected==='cash'&&cash)cash.querySelector('.cash-highlights-controls')?.before(link);else cards.after(link);link.dataset.linkPosition=selected;for(const button of group.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.categoryLink===selected));}
  for(const [value,text] of [['categories','Below categories'],['headline','Beside headline'],['cash','Below cash items']]){const button=document.createElement('button');button.type='button';button.dataset.categoryLink=value;button.textContent=text;button.addEventListener('click',()=>{selected=value;try{localStorage.setItem(key,value)}catch{}apply()});group.append(button)}
  section.append(group);document.addEventListener('astramarketsnapshot',apply);apply();
})();
