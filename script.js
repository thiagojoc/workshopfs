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

  setupEditableBubbles();
});

// Deixa cada mensagem de copy (menos a enquete, que tem estrutura fixa)
// editável direto na página, com uma mini-barra pra negrito/itálico/lista.
// Persiste em localStorage — só nesse navegador (não sincroniza entre
// dispositivos, já que é uma página estática sem backend).
function setupEditableBubbles(){
  var toolbar = document.createElement('div');
  toolbar.className = 'fmt-toolbar';
  toolbar.innerHTML =
    '<button type="button" data-cmd="bold" title="Negrito"><b>B</b></button>' +
    '<button type="button" data-cmd="italic" title="Itálico"><i>I</i></button>' +
    '<button type="button" data-cmd="insertUnorderedList" title="Lista com marcadores">&bull;</button>';
  document.body.appendChild(toolbar);
  var activeBubble = null;

  function saveBubble(b){
    if(!b || !b.dataset.key) return;
    try{ localStorage.setItem('wfs_edit_' + b.dataset.key, b.innerHTML); }catch(e){}
  }
  function positionToolbar(b){
    var r = b.getBoundingClientRect();
    toolbar.style.top = (window.scrollY + r.top - 40) + 'px';
    toolbar.style.left = (window.scrollX + r.left) + 'px';
    toolbar.style.display = 'flex';
  }

  document.querySelectorAll('.day-card').forEach(function(card, di){
    var bubbles = card.querySelectorAll('.bubble:not(.poll)');
    bubbles.forEach(function(b, bi){
      var key = 'd' + di + '_b' + bi;
      b.dataset.key = key;
      var saved = null;
      try{ saved = localStorage.getItem('wfs_edit_' + key); }catch(e){}
      if(saved !== null) b.innerHTML = saved;
      b.setAttribute('contenteditable', 'true');
      b.addEventListener('focus', function(){
        activeBubble = b;
        positionToolbar(b);
      });
      b.addEventListener('blur', function(){
        saveBubble(b);
        setTimeout(function(){
          if(document.activeElement !== toolbar && !toolbar.contains(document.activeElement)){
            toolbar.style.display = 'none';
          }
        }, 120);
      });
    });
  });

  toolbar.querySelectorAll('button').forEach(function(btn){
    btn.addEventListener('mousedown', function(e){
      e.preventDefault(); // não perde o foco/seleção da bolha ao clicar no botão
      if(!activeBubble) return;
      document.execCommand(btn.getAttribute('data-cmd'), false, null);
      saveBubble(activeBubble);
    });
  });

  document.addEventListener('mousedown', function(e){
    if(!toolbar.contains(e.target) && !e.target.closest('.bubble')){
      toolbar.style.display = 'none';
    }
  });
}
