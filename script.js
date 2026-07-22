document.addEventListener('DOMContentLoaded', function(){
  var tabBtns = document.querySelectorAll('.tab-btn');
  var panels = document.querySelectorAll('.panel');
  tabBtns.forEach(function(btn){
    btn.addEventListener('click', function(){
      var target = btn.getAttribute('data-target');
      tabBtns.forEach(function(b){ b.classList.remove('active'); });
      panels.forEach(function(p){ p.classList.remove('active'); });
      btn.classList.add('active');
      var panel = document.getElementById(target);
      if(panel){
        panel.classList.add('active');
        window.scrollTo({top:0, behavior:'smooth'});
      }
    });
  });

  var accQuestions = document.querySelectorAll('.acc-q');
  accQuestions.forEach(function(q){
    q.addEventListener('click', function(){
      var item = q.closest('.acc-item');
      if(!item) return;
      item.classList.toggle('open');
    });
  });

  setupEditableContent();
});

// Deixa qualquer texto do documento (funil, copies do WhatsApp — menos a
// enquete, que tem estrutura fixa —, roteiro, oferta e objeções) editável
// direto na página, com uma mini-barra pra negrito/itálico/lista. Persiste
// em localStorage — só nesse navegador (não sincroniza entre dispositivos,
// já que é uma página estática sem backend).
function setupEditableContent(){
  var toolbar = document.createElement('div');
  toolbar.className = 'fmt-toolbar';
  toolbar.innerHTML =
    '<button type="button" data-cmd="bold" title="Negrito"><b>B</b></button>' +
    '<button type="button" data-cmd="italic" title="Itálico"><i>I</i></button>' +
    '<button type="button" data-cmd="insertUnorderedList" title="Lista com marcadores">&bull;</button>';
  document.body.appendChild(toolbar);
  var activeEl = null;

  function saveEl(el){
    if(!el || !el.dataset.key) return;
    try{ localStorage.setItem('wfs_edit_' + el.dataset.key, el.innerHTML); }catch(e){}
  }
  function positionToolbar(el){
    var r = el.getBoundingClientRect();
    toolbar.style.top = (window.scrollY + r.top - 40) + 'px';
    toolbar.style.left = (window.scrollX + r.left) + 'px';
    toolbar.style.display = 'flex';
  }
  function makeEditable(el, key){
    el.dataset.key = key;
    var saved = null;
    try{ saved = localStorage.getItem('wfs_edit_' + key); }catch(e){}
    if(saved !== null) el.innerHTML = saved;
    el.setAttribute('contenteditable', 'true');
    el.addEventListener('focus', function(){
      activeEl = el;
      positionToolbar(el);
    });
    el.addEventListener('blur', function(){
      saveEl(el);
      setTimeout(function(){
        if(document.activeElement !== toolbar && !toolbar.contains(document.activeElement)){
          toolbar.style.display = 'none';
        }
      }, 120);
    });
  }

  // Grupos de elementos editáveis, cada um com sua própria contagem (pra
  // gerar uma chave estável mesmo que outro grupo mude de tamanho).
  var groups = [
    {sel:'.funnel-label', tag:'fl'},
    {sel:'.funnel-desc', tag:'fd'},
    {sel:'.bubble:not(.poll)', tag:'b'},
    {sel:'.schedule-text', tag:'s'},
    {sel:'.quote > span', tag:'q'},
    {sel:'.acc-q > span:first-child', tag:'aq'},
    {sel:'.acc-a', tag:'aa'}
  ];
  groups.forEach(function(g){
    document.querySelectorAll(g.sel).forEach(function(el, i){
      makeEditable(el, g.tag + i);
    });
  });

  // A pergunta do accordion mora dentro do <button> que abre/fecha a
  // resposta — sem isso, clicar pra editar o texto também ficaria
  // abrindo/fechando o item toda hora.
  document.querySelectorAll('.acc-q > span:first-child').forEach(function(span){
    span.addEventListener('click', function(e){ e.stopPropagation(); });
    span.addEventListener('mousedown', function(e){ e.stopPropagation(); });
  });

  toolbar.querySelectorAll('button').forEach(function(btn){
    btn.addEventListener('mousedown', function(e){
      e.preventDefault(); // não perde o foco/seleção do elemento ao clicar no botão
      if(!activeEl) return;
      document.execCommand(btn.getAttribute('data-cmd'), false, null);
      saveEl(activeEl);
    });
  });

  document.addEventListener('mousedown', function(e){
    if(!toolbar.contains(e.target) && !e.target.closest('[contenteditable="true"]')){
      toolbar.style.display = 'none';
    }
  });
}
