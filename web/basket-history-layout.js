(() => {
  'use strict';
  const section=document.getElementById('view-basket'),history=document.getElementById('basket-history-section');
  if(!section||!history||document.getElementById('basket-history-layout-options'))return;
  const original=document.createComment('Basket history original location');history.before(original);
  const group=document.createElement('div');group.id='basket-history-layout-options';group.className='basket-history-layout-options';group.dataset.previewControls='true';
  group.setAttribute('role','group');group.setAttribute('aria-label','Basket history position');
  const label=document.createElement('span');label.textContent='History position';group.append(label);
  const key='astra-basket-history-position';
  function choose(value){
    const placement=value==='above'?'above':'below';
    if(placement==='above')original.after(history);else group.before(history);
    history.dataset.historyPlacement=placement;
    for(const button of group.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.basketHistoryPosition===placement));
  }
  for(const [value,title] of [['below','Below the table'],['above','Above the table']]){
    const button=document.createElement('button');button.type='button';button.dataset.basketHistoryPosition=value;button.textContent=title;
    button.addEventListener('click',()=>{choose(value);try{localStorage.setItem(key,value)}catch{}});group.append(button);
  }
  section.append(group);let saved;try{saved=localStorage.getItem(key)}catch{}choose(saved);
})();
