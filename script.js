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
});
