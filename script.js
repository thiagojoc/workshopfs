import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Mesmo projeto Firebase ja usado no flowsales-crm e no Body & Mind (conta
// gratuita, plano Spark). Guarda as edicoes deste documento num unico
// documento Firestore, sincronizado ao vivo entre quem estiver com a pagina
// aberta (Alinne, Kenia, Carlos), sem precisar de login.
const _fbConfig = {
  apiKey: "AIzaSyBTqzj-9-AOI181sPCKvRsVGDujkWogIGI",
  authDomain: "flowbody-30162.firebaseapp.com",
  projectId: "flowbody-30162",
  storageBucket: "flowbody-30162.firebasestorage.app",
  messagingSenderId: "440511544358",
  appId: "1:440511544358:web:00dc29d16295ed23f3fae7"
};
const _fbApp = initializeApp(_fbConfig);
const _fbDb = getFirestore(_fbApp);
const _docRef = doc(_fbDb, "workshopfs", "content");

var _liveEdits = {};
var _editableEls = []; // {el, key} de tudo que virou editável nesta página

function _applyRemoteEdits(edits){
  _liveEdits = edits || {};
  _editableEls.forEach(function(item){
    if(document.activeElement === item.el) return; // não atropela quem está digitando agora
    if(Object.prototype.hasOwnProperty.call(_liveEdits, item.key)){
      var val = _liveEdits[item.key];
      if(item.el.innerHTML !== val) item.el.innerHTML = val;
    }
  });
}

function _startLiveSync(){
  onSnapshot(_docRef, function(snap){
    _applyRemoteEdits(snap.exists() ? (snap.data().edits || {}) : {});
  }, function(err){
    console.warn("Sincronização ao vivo indisponível, usando só este navegador.", err);
  });
}

function _saveRemote(key, html){
  var patch = { edits: {} };
  patch.edits[key] = html;
  setDoc(_docRef, patch, { merge: true }).catch(function(err){
    console.warn("Não deu pra salvar ao vivo, ficou só neste navegador.", err);
  });
}

document.addEventListener("DOMContentLoaded", function(){
  var tabBtns = document.querySelectorAll(".tab-btn");
  var panels = document.querySelectorAll(".panel");
  tabBtns.forEach(function(btn){
    btn.addEventListener("click", function(){
      var target = btn.getAttribute("data-target");
      tabBtns.forEach(function(b){ b.classList.remove("active"); });
      panels.forEach(function(p){ p.classList.remove("active"); });
      btn.classList.add("active");
      var panel = document.getElementById(target);
      if(panel){
        panel.classList.add("active");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });

  var accQuestions = document.querySelectorAll(".acc-q");
  accQuestions.forEach(function(q){
    q.addEventListener("click", function(){
      var item = q.closest(".acc-item");
      if(!item) return;
      item.classList.toggle("open");
    });
  });

  setupEditableContent();
  _startLiveSync();
});

// Deixa qualquer texto do documento (funil, copies do WhatsApp, exceto a
// enquete, que tem estrutura fixa, roteiro, oferta e objeções) editável
// direto na página, com uma mini-barra pra negrito/itálico/lista.
// Sincroniza ao vivo pelo Firestore entre quem estiver com a página
// aberta, e usa o localStorage como cópia local (funciona mesmo se o
// Firestore falhar ou estiver offline).
function setupEditableContent(){
  var toolbar = document.createElement("div");
  toolbar.className = "fmt-toolbar";
  toolbar.innerHTML =
    '<button type="button" data-cmd="bold" title="Negrito"><b>B</b></button>' +
    '<button type="button" data-cmd="italic" title="Itálico"><i>I</i></button>' +
    '<button type="button" data-cmd="insertUnorderedList" title="Lista com marcadores">&bull;</button>';
  document.body.appendChild(toolbar);
  var activeEl = null;

  function saveEl(el){
    if(!el || !el.dataset.key) return;
    var key = el.dataset.key, html = el.innerHTML;
    try{ localStorage.setItem("wfs_edit_" + key, html); }catch(e){}
    _liveEdits[key] = html;
    _saveRemote(key, html);
  }
  function positionToolbar(el){
    var r = el.getBoundingClientRect();
    toolbar.style.top = (window.scrollY + r.top - 40) + "px";
    toolbar.style.left = (window.scrollX + r.left) + "px";
    toolbar.style.display = "flex";
  }
  function makeEditable(el, key){
    el.dataset.key = key;
    var saved = null;
    try{ saved = localStorage.getItem("wfs_edit_" + key); }catch(e){}
    if(saved !== null) el.innerHTML = saved;
    el.setAttribute("contenteditable", "true");
    el.addEventListener("focus", function(){
      activeEl = el;
      positionToolbar(el);
    });
    el.addEventListener("blur", function(){
      saveEl(el);
      setTimeout(function(){
        if(document.activeElement !== toolbar && !toolbar.contains(document.activeElement)){
          toolbar.style.display = "none";
        }
      }, 120);
    });
    _editableEls.push({ el: el, key: key });
  }

  // Grupos de elementos editáveis, cada um com sua própria contagem (pra
  // gerar uma chave estável mesmo que outro grupo mude de tamanho).
  var groups = [
    { sel: ".funnel-label", tag: "fl" },
    { sel: ".funnel-desc", tag: "fd" },
    { sel: ".bubble:not(.poll)", tag: "b" },
    { sel: ".schedule-text", tag: "s" },
    { sel: ".quote > span", tag: "q" },
    { sel: ".acc-q > span:first-child", tag: "aq" },
    { sel: ".acc-a", tag: "aa" }
  ];
  groups.forEach(function(g){
    document.querySelectorAll(g.sel).forEach(function(el, i){
      makeEditable(el, g.tag + i);
    });
  });

  // A pergunta do accordion mora dentro do <button> que abre/fecha a
  // resposta, então sem isso clicar pra editar o texto também ficaria
  // abrindo/fechando o item toda hora.
  document.querySelectorAll(".acc-q > span:first-child").forEach(function(span){
    span.addEventListener("click", function(e){ e.stopPropagation(); });
    span.addEventListener("mousedown", function(e){ e.stopPropagation(); });
  });

  toolbar.querySelectorAll("button").forEach(function(btn){
    btn.addEventListener("mousedown", function(e){
      e.preventDefault(); // não perde o foco/seleção do elemento ao clicar no botão
      if(!activeEl) return;
      document.execCommand(btn.getAttribute("data-cmd"), false, null);
      saveEl(activeEl);
    });
  });

  document.addEventListener("mousedown", function(e){
    if(!toolbar.contains(e.target) && !e.target.closest('[contenteditable="true"]')){
      toolbar.style.display = "none";
    }
  });
}

// Junta todas as edições conhecidas (vindas do Firestore ou deste
// navegador) num texto simples, útil pra revisar tudo de uma vez ou como
// alternativa caso a sincronização ao vivo esteja indisponível.
function exportEdits(){
  var groupLabels = { fl: "Funil, titulo", fd: "Funil, descricao", b: "Mensagem de copy", s: "Roteiro", q: "Oferta", aq: "Objecao, pergunta", aa: "Objecao, resposta" };
  var keys = Object.keys(_liveEdits || {});
  try{
    for(var i = 0; i < localStorage.length; i++){
      var k = localStorage.key(i);
      if(k && k.indexOf("wfs_edit_") === 0){
        var short = k.slice("wfs_edit_".length);
        if(keys.indexOf(short) === -1) keys.push(short);
      }
    }
  }catch(e){}
  if(!keys.length){
    alert("Nenhuma edição encontrada ainda.");
    return;
  }
  var lines = keys.map(function(key){
    var tag = key.match(/^[a-z]+/)[0];
    var el = document.querySelector('[data-key="' + key + '"]');
    var text = el ? el.innerText : (_liveEdits[key] || localStorage.getItem("wfs_edit_" + key));
    return "[" + (groupLabels[tag] || tag) + "] " + text;
  });
  var out = lines.join("\n\n");
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(out).then(function(){
      alert("Edições copiadas! Cole e envie se quiser revisar tudo de uma vez.");
    }).catch(function(){
      window.prompt("Copie o texto abaixo:", out);
    });
  }else{
    window.prompt("Copie o texto abaixo:", out);
  }
}
window.exportEdits = exportEdits;
