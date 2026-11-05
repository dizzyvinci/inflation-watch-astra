(() => {
  'use strict';
  const movers = document.getElementById('movers'), panel = movers?.closest('.panel');
  if (!panel || document.getElementById('mover-size-options')) return;
  panel.classList.add('mover-size-preview');
  const key = 'astra-mover-panel-size';
  const captionKey='astra-mover-impact-caption', heading=panel.querySelector('h2');
  const caption=document.createElement('p');caption.className='mover-impact-caption';
  caption.append(document.createTextNode('Most impacted by inflation '));
  const help=document.createElement('a');help.href='#method-weights';help.textContent='?';help.setAttribute('aria-label','Ranked by contribution to the index; item-specific supply and demand can also change prices.');
  const sup=document.createElement('sup');sup.append(help);caption.append(sup);heading?.after(caption);
  const group = document.createElement('div'); group.id='mover-size-options';
  group.className='panel-size-options'; group.dataset.previewControls='true';
  group.setAttribute('role','group'); group.setAttribute('aria-label','Index movers panel width');
  const label=document.createElement('span');label.textContent='Panel width';group.append(label);
  function select(value) {
    const size=value==='compact'?'compact':'full';panel.dataset.panelSize=size;
    for(const button of group.querySelectorAll('button[data-panel-size-choice]'))button.setAttribute('aria-pressed',String(button.dataset.panelSizeChoice===size));
  }
  for(const [mode,label] of [['full','Full width'],['compact','Compact width']]) {
    const button=document.createElement('button');button.type='button';button.dataset.panelSizeChoice=mode;button.textContent=label;
    button.addEventListener('click',()=>{select(mode);try{localStorage.setItem(key,mode)}catch{}});group.append(button);
  }
  const captionToggle=document.createElement('button');captionToggle.type='button';
  let captionOn=true;try{captionOn=localStorage.getItem(captionKey)!=='off'}catch{}
  const updateCaption=()=>{caption.hidden=!captionOn;panel.dataset.impactCaption=captionOn?'on':'off';captionToggle.textContent='Impact heading: '+(captionOn?'On':'Off');captionToggle.setAttribute('aria-pressed',String(captionOn))};
  captionToggle.addEventListener('click',()=>{captionOn=!captionOn;try{localStorage.setItem(captionKey,captionOn?'on':'off')}catch{}updateCaption()});group.append(captionToggle);updateCaption();
  const note=document.createElement('small');note.textContent='Preview this panel only; data and column proportions stay the same.';group.append(note);panel.append(group);
  let saved;try{saved=localStorage.getItem(key)}catch{}select(saved);
})();
