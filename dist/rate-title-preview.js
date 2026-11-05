(() => {
  'use strict';
  const title=document.getElementById('overview-title'),options=document.getElementById('display-options');
  if(!title||!options||document.getElementById('rate-title-options'))return;
  const choices=new Map([['benchmark','Goods-inflation NX benchmark'],['calculated','Calculated NX rate'],['estimated','Estimated NX rate']]);
  const key='astra-rate-title-v1';let selected='benchmark';try{const saved=localStorage.getItem(key);if(choices.has(saved))selected=saved;}catch{}
  const group=document.createElement('div');group.id='rate-title-options';group.className='hero-layout-options';group.dataset.previewControls='true';group.setAttribute('role','group');group.setAttribute('aria-label','NX headline wording');
  const label=document.createElement('span');label.textContent='NX headline wording';group.append(label);
  function apply(){title.textContent=choices.get(selected);for(const button of group.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.rateTitle===selected));}
  for(const [value,text] of choices){const button=document.createElement('button');button.type='button';button.dataset.rateTitle=value;button.textContent=text;button.addEventListener('click',()=>{selected=value;try{localStorage.setItem(key,value)}catch{}apply()});group.append(button)}
  const note=document.createElement('small');note.textContent='Wording only. Every option retains the goods-based model and its explanation; the cash-sale estimate stays separate.';group.append(note);const explanation=document.querySelector('.hero-benchmark-explanation');if(explanation){let shown=true;const key='astra-benchmark-explanation-v1';try{shown=localStorage.getItem(key)!=='off'}catch{}const button=document.createElement('button');button.type='button';const update=()=>{explanation.hidden=!shown;button.textContent='Buying-power explanation: '+(shown?'On':'Off');button.setAttribute('aria-pressed',String(shown))};button.addEventListener('click',()=>{shown=!shown;try{localStorage.setItem(key,shown?'on':'off')}catch{}update()});group.append(button);update()}options.append(group);
  document.addEventListener('astramarketsnapshot',apply);apply();
})();
