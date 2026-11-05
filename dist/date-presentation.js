(() => {
  'use strict';
  if(window.AstraDatePresentation)return;
  const pattern=/\b(20\d{2})-(\d{2})-(\d{2})(?=T|\b)/g;
  const format=text=>String(text).replace(pattern,(match,y,m,d)=>{const date=new Date(`${y}-${m}-${d}T00:00:00Z`);return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===match?`${m}-${d}-${y}`:match});
  const skip=node=>node.parentElement?.closest('script,style,pre,code,textarea,input,[contenteditable="true"],[data-raw-date]');
  function visit(node){if(node.nodeType===3){if(!skip(node)){const next=format(node.nodeValue);if(next!==node.nodeValue)node.nodeValue=next}return}if(node.nodeType!==1||node.matches?.('script,style,pre,code,textarea,input,[contenteditable="true"],[data-raw-date]'))return;const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode())visit(text)}
  window.AstraDatePresentation=Object.freeze({format});
  visit(document.body);
  const pending=new Set();let scheduled=false;
  const flush=()=>{scheduled=false;const nodes=[...pending];pending.clear();for(const node of nodes)if(node.isConnected)visit(node)};
  new MutationObserver(records=>{for(const record of records){if(record.type==='characterData')pending.add(record.target);else for(const node of record.addedNodes)pending.add(node)}if(pending.size&&!scheduled){scheduled=true;requestAnimationFrame(flush)}}).observe(document.body,{childList:true,subtree:true,characterData:true});
})();
