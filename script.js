import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Mesmo projeto Firebase ja usado no flowsales-crm e no Body & Mind (conta
// gratuita, plano Spark). Guarda as edicoes e resultados de cada workshop
// num documento Firestore por escritorio+workshop, sincronizado ao vivo
// entre quem estiver com a pagina aberta.
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

// Escritorios com acesso ao material, cada um com seu codigo e sua lista de
// workshops. O docId de cada workshop e o nome do documento no Firestore
// (o workshop atual da Pacheco e Portela usa "content" pra nao perder as
// edicoes ja salvas de antes dessa divisao por escritorio existir).
var OFFICES = [
  {
    id: "pacheco",
    name: "Pacheco & Portela Advocacia",
    code: "PP+FS",
    badges: [
      "Preparado para: Dra. Alinne e Dra. Kênia",
      "Pacheco &amp; Portela Advocacia"
    ],
    workshops: [
      {
        id: "aux-maternidade-2907",
        name: "Auxílio Maternidade · 29/07/2026",
        docId: "content"
      }
    ]
  },
  {
    id: "dinizhenn",
    name: "Diniz e Henn Advocacia",
    code: "DHA+FS",
    badges: [
      "Diniz e Henn Advocacia"
    ],
    workshops: [
      {
        id: "traslado-1908",
        name: "Traslado de Registro Civil · 19/08/2026",
        docId: "traslado-1908"
      }
    ]
  }
];

var _docRef = null;
var _unsubSnapshot = null;
var _liveEdits = {};
var _editableEls = []; // {el, key} de tudo que virou editável nesta página
var _resultInputs = []; // elementos .result-input desta página

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

function _applyRemoteResults(results){
  results = results || {};
  _resultInputs.forEach(function(input){
    if(document.activeElement === input) return;
    var rkey = input.dataset.rkey;
    if(Object.prototype.hasOwnProperty.call(results, rkey)){
      var val = String(results[rkey]);
      if(input.value !== val) input.value = val;
    }
  });
}

function _startLiveSync(){
  if(!_docRef) return;
  if(_unsubSnapshot) _unsubSnapshot();
  _unsubSnapshot = onSnapshot(_docRef, function(snap){
    var data = snap.exists() ? snap.data() : {};
    _applyRemoteEdits(data.edits || {});
    _applyRemoteResults(data.results || {});
  }, function(err){
    console.warn("Sincronização ao vivo indisponível, usando só este navegador.", err);
  });
}

function _saveRemote(key, html){
  if(!_docRef) return;
  var patch = { edits: {} };
  patch.edits[key] = html;
  setDoc(_docRef, patch, { merge: true }).catch(function(err){
    console.warn("Não deu pra salvar ao vivo, ficou só neste navegador.", err);
  });
}

function _saveRemoteResult(rkey, value){
  if(!_docRef) return;
  var patch = { results: {} };
  patch.results[rkey] = value;
  setDoc(_docRef, patch, { merge: true }).catch(function(err){
    console.warn("Não deu pra salvar o resultado ao vivo, ficou só neste navegador.", err);
  });
}

// ── ACESSO POR CÓDIGO DO ESCRITÓRIO ──────────────────────
// Código de admin: entra vendo todos os escritórios juntos (visão geral),
// não fica preso a um só. Usado pelo Thiago e pelo Carlos.
var ADMIN_CODE = "FS2026";

function _buildAdminOffice(){
  var allWorkshops = [];
  OFFICES.forEach(function(o){
    o.workshops.forEach(function(w){
      allWorkshops.push({
        id: o.id + "__" + w.id,
        name: o.name + " — " + w.name,
        docId: w.docId,
        // aponta direto pro documento real do escritório (ver _selectWorkshop
        // e _setupComparativo), em vez de montar a chave a partir do id
        // sintético "admin" deste escritório virtual.
        fullDocId: o.id + "_" + w.docId,
        // dono de verdade desse workshop, pra saber qual conteudo mostrar
        // (funil/copies/roteiro/oferta/objeções/resultados) quando ele for
        // selecionado no modo admin. Ver _selectWorkshop.
        realOfficeId: o.id
      });
    });
  });
  return {
    id: "admin",
    name: "Visão Geral (Admin)",
    code: ADMIN_CODE,
    badges: [
      "Visão geral · todos os escritórios",
      "Acesso Thiago e Carlos"
    ],
    workshops: allWorkshops
  };
}

function _findOffice(code){
  var norm = (code || "").trim().toUpperCase();
  if(norm === ADMIN_CODE) return _buildAdminOffice();
  return OFFICES.filter(function(o){ return o.code === norm; })[0] || null;
}

function _setupGate(){
  var gate = document.getElementById("access-gate");
  var shell = document.getElementById("app-shell");
  var input = document.getElementById("gate-code");
  var btn = document.getElementById("gate-btn");
  var err = document.getElementById("gate-err");
  var logoutBtn = document.getElementById("gate-logout");

  function unlock(office){
    gate.style.display = "none";
    shell.style.display = "";
    _initOffice(office);
  }

  function tryCode(){
    var office = _findOffice(input.value);
    if(office){
      try{ localStorage.setItem("wfs_office_code", office.code); }catch(e){}
      err.style.display = "none";
      unlock(office);
    }else{
      err.style.display = "block";
    }
  }

  btn.addEventListener("click", tryCode);
  input.addEventListener("keydown", function(e){
    if(e.key === "Enter") tryCode();
  });

  if(logoutBtn){
    logoutBtn.addEventListener("click", function(){
      try{ localStorage.removeItem("wfs_office_code"); }catch(e){}
      if(_unsubSnapshot){ _unsubSnapshot(); _unsubSnapshot = null; }
      shell.style.display = "none";
      gate.style.display = "flex";
      input.value = "";
      input.focus();
    });
  }

  var savedCode = null;
  try{ savedCode = localStorage.getItem("wfs_office_code"); }catch(e){}
  var savedOffice = savedCode ? _findOffice(savedCode) : null;
  if(savedOffice){
    unlock(savedOffice);
  }else{
    gate.style.display = "flex";
    shell.style.display = "none";
  }
}

// ── SELEÇÃO DE WORKSHOP DENTRO DO ESCRITÓRIO ─────────────
// A pagina e compartilhada entre todos os escritorios, mas cada um so deve
// ver o proprio conteudo (funil, copies, roteiro, oferta, objecoes,
// resultados). Cada bloco especifico de um escritorio carrega
// data-office="id-do-escritorio"; no modo admin (visao geral) mostra tudo.
function _applyOfficeVisibility(office){
  var showAll = office.id === "admin";
  document.querySelectorAll("[data-office]").forEach(function(el){
    el.style.display = (showAll || el.dataset.office === office.id) ? "" : "none";
  });
}

function _initOffice(office){
  _applyOfficeVisibility(office);
  var metaEl = document.getElementById("office-meta");
  var switchWrap = document.getElementById("workshop-switch");
  var select = document.getElementById("workshop-select");
  var noWorkshop = document.getElementById("no-workshop-state");
  var tabsWrap = document.getElementById("tabs-wrap");
  var mainEl = document.querySelector("main");

  if(metaEl) metaEl.innerHTML = (office.badges || []).map(function(b){
    return '<span class="badge">' + b + '</span>';
  }).join("");

  _setupComparativo(office);

  if(!office.workshops.length){
    if(tabsWrap) tabsWrap.style.display = "none";
    if(mainEl) mainEl.style.display = "none";
    if(noWorkshop) noWorkshop.style.display = "block";
    if(switchWrap) switchWrap.style.display = "none";
    return;
  }

  if(tabsWrap) tabsWrap.style.display = "";
  if(mainEl) mainEl.style.display = "";
  if(noWorkshop) noWorkshop.style.display = "none";

  if(switchWrap) switchWrap.style.display = office.workshops.length ? "flex" : "none";
  if(select){
    select.innerHTML = office.workshops.map(function(w){
      return '<option value="' + w.id + '">' + w.name + '</option>';
    }).join("");

    var savedWorkshopId = null;
    try{ savedWorkshopId = localStorage.getItem("wfs_workshop_" + office.id); }catch(e){}
    var current = office.workshops.filter(function(w){ return w.id === savedWorkshopId; })[0] || office.workshops[0];
    select.value = current.id;

    select.addEventListener("change", function(){
      var chosen = office.workshops.filter(function(w){ return w.id === select.value; })[0];
      if(!chosen) return;
      try{ localStorage.setItem("wfs_workshop_" + office.id, chosen.id); }catch(e){}
      _selectWorkshop(office, chosen);
    });

    _selectWorkshop(office, current);
  }
}

function _selectWorkshop(office, workshop){
  // no modo admin, cada workshop ja carrega o fullDocId com a chave real do
  // escritorio dono do conteudo (ver _buildAdminOffice); nos escritorios
  // normais isso fica vazio e a chave continua sendo montada como sempre.
  var key = workshop.fullDocId || (office.id + "_" + workshop.docId);
  _docRef = doc(_fbDb, "workshopfs", key);
  _startLiveSync();
  // no modo admin, o conteudo dos paineis (funil, copies, roteiro, oferta,
  // objeções, resultados) precisa acompanhar o workshop escolhido no
  // seletor, mostrando so o escritorio dono dele. Sem isso, ficava sempre
  // mostrando tudo junto (os dois escritorios), mesmo depois de trocar de
  // workshop no seletor.
  if(office.id === "admin"){
    _applyOfficeVisibility({ id: workshop.realOfficeId || office.id });
  }
}

// ── COMPARATIVO DE WORKSHOPS ──────────────────────────────
var _compareUnsubs = [];
var _RESULT_COLS = ["leads", "leadsAugeGrupo", "leadsPico", "vendas"];

function _setupComparativo(office){
  _compareUnsubs.forEach(function(unsub){ unsub(); });
  _compareUnsubs = [];

  var tbody = document.getElementById("compare-tbody");
  var empty = document.getElementById("compare-empty");
  if(!tbody || !empty) return;

  if(!office.workshops.length){
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  tbody.innerHTML = office.workshops.map(function(w){
    return '<tr id="compare-row-' + w.id + '">' +
      '<td class="compare-name">' + w.name + '</td>' +
      _RESULT_COLS.map(function(){ return '<td>-</td>'; }).join("") +
      '</tr>';
  }).join("");

  office.workshops.forEach(function(w){
    var key = w.fullDocId || (office.id + "_" + w.docId);
    var wDocRef = doc(_fbDb, "workshopfs", key);
    var unsub = onSnapshot(wDocRef, function(snap){
      var results = (snap.exists() ? snap.data().results : {}) || {};
      var row = document.getElementById("compare-row-" + w.id);
      if(!row) return;
      var cells = row.querySelectorAll("td");
      _RESULT_COLS.forEach(function(col, i){
        var val = results[col];
        cells[i + 1].textContent = (val === undefined || val === null || val === "") ? "-" : val;
      });
    }, function(err){
      console.warn("Não deu pra carregar o comparativo de " + w.id, err);
    });
    _compareUnsubs.push(unsub);
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
  setupResultsPanel();
  setupLightbox();
  _setupGate();
});

// Clique numa imagem real do funil (print/criativo) abre ela maior, em cima
// do resto da página. Clique de novo em qualquer lugar fecha.
function setupLightbox(){
  var overlay = document.createElement("div");
  overlay.className = "lightbox-overlay";
  var img = document.createElement("img");
  overlay.appendChild(img);
  document.body.appendChild(overlay);

  document.querySelectorAll(".real-img").forEach(function(thumb){
    thumb.style.cursor = "zoom-in";
    thumb.addEventListener("click", function(){
      img.src = thumb.src;
      overlay.classList.add("show");
    });
  });

  overlay.addEventListener("click", function(){
    overlay.classList.remove("show");
    img.src = "";
  });
}

// Campos numéricos da aba "Resultados por Workshop": salvam ao sair do
// campo, sincronizados ao vivo pelo mesmo documento do workshop atual.
function setupResultsPanel(){
  _resultInputs = Array.prototype.slice.call(document.querySelectorAll(".result-input"));
  _resultInputs.forEach(function(input){
    input.addEventListener("blur", function(){
      _saveRemoteResult(input.dataset.rkey, input.value);
    });
  });
}

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

  // Grupos de elementos editáveis. A chave de cada um vem de um hash do
  // texto original (não da posição no HTML), pra continuar apontando pro
  // balão certo mesmo depois que a página ganha conteúdo novo no meio,
  // o que antes deslocava a numeração de tudo que vinha depois e fazia
  // edições salvas caírem no elemento errado.
  function _hashStr(s){
    var h = 0;
    for(var i = 0; i < s.length; i++){
      h = (h * 31 + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36);
  }
  var groups = [
    { sel: ".funnel-label", tag: "fl" },
    { sel: ".funnel-desc", tag: "fd" },
    { sel: ".setup-text", tag: "st" },
    { sel: ".bubble:not(.poll)", tag: "b" },
    { sel: ".schedule-text", tag: "s" },
    { sel: ".quote > span", tag: "q" },
    { sel: ".acc-q > span:first-child", tag: "aq" },
    { sel: ".acc-a", tag: "aa" }
  ];
  groups.forEach(function(g){
    var seen = {};
    document.querySelectorAll(g.sel).forEach(function(el){
      var base = g.tag + "_" + _hashStr(el.textContent.trim());
      var n = seen[base] = (seen[base] || 0) + 1;
      var key = n > 1 ? base + "_" + n : base;
      makeEditable(el, key);
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
