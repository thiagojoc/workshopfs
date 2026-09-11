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
      },
      {
        id: "aposentadoria-0209",
        name: "2 Aposentadorias no Exterior · 02/09/2026",
        docId: "aposentadoria-0209"
      },
      {
        id: "saida-fiscal-1609",
        name: "Saída Fiscal, Planejamento Previdenciário & Direito de Família · 16/09/2026",
        docId: "saida-fiscal-1609"
      }
    ],
    // Workshops anteriores do DHA que so entram no comparativo (sem funil,
    // sem as outras abas). Leads/vendas/faturamento sao os resultados
    // finais que o Thiago ja preencheu, entao ficam fixos aqui no codigo;
    // só o investimento continua editavel direto na tabela (ver
    // _setupComparativo), porque ainda nao foi preenchido.
    compareExtras: [
      { id: "saida-fiscal-1504", name: "Workshop Saída Fiscal · 15/04/2026", fullDocId: "dinizhenn_saida-fiscal-1504",
        fixedResults: { leads: "135", leadsAugeGrupo: "135", leadsPico: "53", vendas: "10", faturamento: "R$30.000" } },
      { id: "planejamento-prev-0705", name: "Workshop Planejamento Previdenciário · 07/05/2026", fullDocId: "dinizhenn_planejamento-prev-0705",
        fixedResults: { leads: "50", leadsAugeGrupo: "50", leadsPico: "25", vendas: "5", faturamento: "R$6.250" } },
      { id: "saida-fiscal-1405", name: "Workshop Saída Fiscal · 14/05/2026", fullDocId: "dinizhenn_saida-fiscal-1405",
        fixedResults: { leads: "95", leadsAugeGrupo: "95", leadsPico: "46", vendas: "13", faturamento: "R$20.000" } },
      { id: "saida-fiscal-2105", name: "Workshop Saída Fiscal · 21/05/2026", fullDocId: "dinizhenn_saida-fiscal-2105",
        fixedResults: { leads: "97", leadsAugeGrupo: "97", leadsPico: "42", vendas: "10", faturamento: "R$25.000" } }
    ]
  }
];

var _docRef = null;
var _unsubSnapshot = null;
var _liveEdits = {};
var _editableEls = []; // {el, key} de tudo que virou editável nesta página
var _resultInputs = []; // elementos .result-input desta página

// Considera "vazio" um trecho editado que só tem tags/espacos/&nbsp/<br>
// sem nenhum texto de verdade (ex: alguém selecionou tudo e apagou, o
// contenteditable às vezes deixa um <br> sobrando). Isso evita balõezinhos
// fantasmas, bem estreitos, sobrando na página depois de uma edição ao
// vivo que esvaziou o conteúdo original.
function _isBlankHtml(html){
  var text = (html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ");
  return text.trim() === "";
}

function _applyRemoteEdits(edits){
  _liveEdits = edits || {};
  _editableEls.forEach(function(item){
    if(document.activeElement === item.el) return; // não atropela quem está digitando agora
    if(Object.prototype.hasOwnProperty.call(_liveEdits, item.key)){
      var val = _liveEdits[item.key];
      if(item.el.innerHTML !== val) item.el.innerHTML = val;
    }
    item.el.style.display = _isBlankHtml(item.el.innerHTML) ? "none" : "";
  });
}

// id do result-card do workshop atual (ver _selectWorkshop). Sem isso,
// _applyRemoteResults atualizava TODOS os .result-input da pagina que
// batessem o data-rkey, vazando os numeros de um workshop pros campos
// (escondidos, mas com o mesmo rkey "leads"/"vendas"/etc) de outro.
var _currentResultCardId = null;

function _applyRemoteResults(results){
  results = results || {};
  _resultInputs.forEach(function(input){
    if(document.activeElement === input) return;
    var card = input.closest(".result-card");
    if(_currentResultCardId && card && card.id !== _currentResultCardId) return;
    var rkey = input.dataset.rkey;
    var val = Object.prototype.hasOwnProperty.call(results, rkey) ? String(results[rkey]) : "";
    if(input.value !== val) input.value = val;
    var field = input.closest(".link-field");
    if(field) _syncLinkFieldView(field);
  });
}

// Campos de link (transcrição/gravação): por padrão mostram o link salvo
// como texto clicável, que já abre em aba nova. Um botão "Editar" troca
// pro campo de digitar, e "Salvar" grava e volta pro modo de
// visualização. Sem link salvo ainda, já abre direto no modo de digitar.
function _syncLinkFieldView(field){
  var input = field.querySelector(".result-input");
  var anchor = field.querySelector(".link-anchor");
  var viewEl = field.querySelector(".link-view");
  var editEl = field.querySelector(".link-edit");
  if(!input || !anchor || !viewEl || !editEl) return;
  if(document.activeElement === input) return; // não atropela quem está digitando agora
  var val = input.value.trim();
  if(val){
    anchor.href = val;
    anchor.textContent = val;
    viewEl.style.display = "";
    editEl.style.display = "none";
  }else{
    viewEl.style.display = "none";
    editEl.style.display = "";
  }
}

function setupLinkFields(){
  document.querySelectorAll(".link-field").forEach(function(field){
    var input = field.querySelector(".result-input");
    var saveBtn = field.querySelector(".link-save-btn");
    var editBtn = field.querySelector(".link-edit-btn");
    if(!input) return;
    if(saveBtn){
      saveBtn.addEventListener("click", function(){
        _saveRemoteResult(input.dataset.rkey, input.value);
        _syncLinkFieldView(field);
      });
    }
    if(editBtn){
      editBtn.addEventListener("click", function(){
        field.querySelector(".link-view").style.display = "none";
        field.querySelector(".link-edit").style.display = "";
        input.focus();
      });
    }
    input.addEventListener("keydown", function(e){
      if(e.key === "Enter"){
        e.preventDefault();
        if(saveBtn) saveBtn.click();
      }
    });
    _syncLinkFieldView(field);
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
  var allExtras = [];
  OFFICES.forEach(function(o){
    o.workshops.forEach(function(w){
      allWorkshops.push({
        id: o.id + "__" + w.id,
        name: o.name + " · " + w.name,
        docId: w.docId,
        // aponta direto pro documento real do escritório (ver _selectWorkshop
        // e _setupComparativo), em vez de montar a chave a partir do id
        // sintético "admin" deste escritório virtual.
        fullDocId: o.id + "_" + w.docId,
        // dono de verdade desse workshop, pra saber qual conteudo mostrar
        // (funil/copies/roteiro/oferta/objeções/resultados) quando ele for
        // selecionado no modo admin. Ver _selectWorkshop.
        realOfficeId: o.id,
        realWorkshopId: w.id
      });
    });
    (o.compareExtras || []).forEach(function(e){
      allExtras.push({
        id: o.id + "__" + e.id,
        name: o.name + " · " + e.name,
        fullDocId: e.fullDocId,
        fixedResults: e.fixedResults
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
    workshops: allWorkshops,
    compareExtras: allExtras
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
// Alguns escritorios (o DHA, por exemplo) tem mais de um workshop, entao
// blocos especificos de UM workshop tambem carregam data-workshop="id" -
// um bloco sem data-workshop e comum a todos os workshops daquele
// escritorio (titulos, intros compartilhadas etc).
function _applyOfficeVisibility(office, workshopId){
  var showAll = office.id === "admin";
  document.querySelectorAll("[data-office]").forEach(function(el){
    var officeOk = showAll || el.dataset.office === office.id;
    var workshopOk = !el.dataset.workshop || !workshopId || el.dataset.workshop === workshopId;
    el.style.display = (officeOk && workshopOk) ? "" : "none";
  });
  // Os workshops do DHA que ja tiveram (ou vao ter) reuniao de alinhamento
  // viram material de estudo completo no painel 3, nao so um cronograma,
  // entao o rotulo da aba muda pra deixar isso claro.
  var _WORKSHOPS_COM_DIRECIONAMENTO = ["traslado-1908", "aposentadoria-0209", "saida-fiscal-1609"];
  var tab3Label = document.getElementById("tab3-label");
  if(tab3Label){
    tab3Label.textContent = (office.id === "dinizhenn" && _WORKSHOPS_COM_DIRECIONAMENTO.indexOf(workshopId) !== -1)
      ? "Roteiro & Direcionamento" : "Roteiro";
  }
  // Workshops com Direcionamento levam as objecoes pra dentro do proprio
  // Roteiro & Direcionamento (como mais um ponto de estudo), entao a aba
  // separada de Objecoes some pra eles; o Pacheco (sem Direcionamento
  // ainda) continua com a aba de Objecoes de sempre.
  var tab5Btn = document.querySelector('.tab-btn[data-target="panel-5"]');
  if(tab5Btn){
    tab5Btn.style.display = (office.id === "dinizhenn" && _WORKSHOPS_COM_DIRECIONAMENTO.indexOf(workshopId) !== -1)
      ? "none" : "";
  }
  // Se a aba que estava ativa sumiu (era de outro workshop/escritorio),
  // volta pra Visao Geral em vez de deixar o painel antigo aberto sem
  // nenhuma aba marcada.
  var activeTab = document.querySelector(".tab-btn.active");
  if(activeTab && activeTab.style.display === "none"){
    var firstTab = document.querySelector('.tab-btn[data-target="panel-1"]');
    if(firstTab) firstTab.click();
  }
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
  // o conteudo dos paineis (funil, copies, roteiro, oferta, objeções,
  // resultados) precisa acompanhar o workshop escolhido no seletor, tanto
  // no modo admin (entre escritorios) quanto dentro de um mesmo escritorio
  // com mais de um workshop (ex: DHA). Sem isso, ficava sempre mostrando
  // tudo junto, mesmo depois de trocar de workshop no seletor.
  var realOfficeId = workshop.realOfficeId || office.id;
  var realWorkshopId = workshop.realWorkshopId || workshop.id;
  _applyOfficeVisibility({ id: realOfficeId }, realWorkshopId);
  // precisa ser definido ANTES de _startLiveSync: o onSnapshot pode
  // responder de forma sincrona (ou quase), e _applyRemoteResults usa
  // esse id pra saber em qual result-card escrever.
  _currentResultCardId = "result-card-" + realWorkshopId;

  // no modo admin, cada workshop ja carrega o fullDocId com a chave real do
  // escritorio dono do conteudo (ver _buildAdminOffice); nos escritorios
  // normais isso fica vazio e a chave continua sendo montada como sempre.
  var key = workshop.fullDocId || (office.id + "_" + workshop.docId);
  _docRef = doc(_fbDb, "workshopfs", key);
  _startLiveSync();
}

// ── COMPARATIVO DE WORKSHOPS ──────────────────────────────
var _compareUnsubs = [];
var _RESULT_COLS = ["leads", "leadsAugeGrupo", "leadsPico", "vendas", "faturamento", "investimento"];
var _compareRowData = {}; // { rowId: { name, faturamento:number|null, investimento:number|null } }, usado pro gráfico

// Converte texto de dinheiro num número. Aceita "R$ 1.234,56", "$6.000",
// "1250" etc: se tiver vírgula E ponto, o último dos dois é o separador
// decimal; se só um deles aparecer, só conta como decimal quando tiver
// exatamente 2 dígitos depois (senão é separador de milhar).
function _parseMoney(str){
  if(str === undefined || str === null) return null;
  var s = String(str).trim();
  if(!s) return null;
  var neg = s.indexOf("-") !== -1;
  s = s.replace(/[^\d,.]/g, "");
  if(!s) return null;
  var lastComma = s.lastIndexOf(",");
  var lastDot = s.lastIndexOf(".");
  if(lastComma !== -1 && lastDot !== -1){
    s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  }else if(lastComma !== -1){
    s = (s.length - lastComma - 1 === 2) ? s.replace(",", ".") : s.replace(/,/g, "");
  }else if(lastDot !== -1){
    if(s.length - lastDot - 1 !== 2) s = s.replace(/\./g, "");
  }
  var n = parseFloat(s);
  if(isNaN(n)) return null;
  return neg ? -n : n;
}

function _formatNumber(n){
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

// Versão compacta (20000 -> "20k", 6250 -> "6,3k") só pro valor em cima
// de cada barrinha do gráfico: a coluna é estreita, e "20.000" por
// extenso colidia com o número da coluna vizinha. A tabela do
// comparativo continua mostrando o valor completo normalmente.
function _formatCompact(n){
  var abs = Math.abs(n);
  if(abs >= 1000){
    var v = Math.round(n / 100) / 10;
    return _formatNumber(v).replace(/,0$/, "") + "k";
  }
  return _formatNumber(n);
}

function _escapeHtml(s){
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// ROI = faturamento menos investimento. So calcula quando os dois valores
// existem (senão fica "-"); atualiza a célula da linha e redesenha o
// gráfico de performance.
function _updateCompareRoi(rowId){
  var row = document.getElementById("compare-row-" + rowId);
  if(!row) return;
  var roiCell = row.querySelector(".compare-roi");
  if(roiCell){
    var v = (_compareRowData[rowId] || {}).values || {};
    if(v.faturamento === null || v.faturamento === undefined || v.investimento === null || v.investimento === undefined){
      roiCell.textContent = "-";
      roiCell.classList.remove("roi-neg", "roi-pos");
    }else{
      var roi = v.faturamento - v.investimento;
      roiCell.textContent = (roi < 0 ? "-" : "") + _formatNumber(Math.abs(roi));
      roiCell.classList.toggle("roi-neg", roi < 0);
      roiCell.classList.toggle("roi-pos", roi > 0);
    }
  }
  _renderCompareChart();
}

function _setupComparativo(office){
  _compareUnsubs.forEach(function(unsub){ unsub(); });
  _compareUnsubs = [];
  _compareRowData = {};

  var tbody = document.getElementById("compare-tbody");
  var empty = document.getElementById("compare-empty");
  if(!tbody || !empty) return;

  // Workshops de verdade (com funil, abas etc) entram como linha só de
  // leitura, puxando o que foi preenchido na aba Resultados de cada um.
  // As "extras" (compareExtras) não têm workshop nem aba própria: leads/
  // vendas/faturamento já são resultado final (fixos, ver OFFICES), só o
  // investimento continua editável direto na tabela, que é a única
  // interface que essas linhas têm.
  var extras = office.compareExtras || [];
  var allRows = office.workshops.concat(extras);

  if(!allRows.length){
    tbody.innerHTML = "";
    empty.style.display = "block";
    _renderCompareChart();
    return;
  }
  empty.style.display = "none";

  tbody.innerHTML = allRows.map(function(w){
    var isExtra = extras.indexOf(w) !== -1;
    var fixed = w.fixedResults || {};
    var cells = _RESULT_COLS.map(function(col){
      if(col === "investimento"){
        return isExtra
          ? '<td><input type="text" class="compare-input" data-rkey="investimento" placeholder="-"></td>'
          : '<td>-</td>';
      }
      if(isExtra){
        var val = fixed[col];
        return '<td>' + (val === undefined || val === null || val === "" ? "-" : _escapeHtml(val)) + '</td>';
      }
      return '<td>-</td>';
    }).join("");
    return '<tr id="compare-row-' + w.id + '">' +
      '<td class="compare-name">' + _escapeHtml(w.name) + '</td>' +
      cells +
      '<td class="compare-roi">-</td>' +
      '</tr>';
  }).join("");

  allRows.forEach(function(w){
    var isExtra = extras.indexOf(w) !== -1;
    var key = w.fullDocId || (office.id + "_" + w.docId);
    var wDocRef = doc(_fbDb, "workshopfs", key);
    var row = document.getElementById("compare-row-" + w.id);
    var fixed = w.fixedResults || {};

    _compareRowData[w.id] = {
      name: w.name,
      values: {
        leads: isExtra ? _parseMoney(fixed.leads) : null,
        leadsAugeGrupo: isExtra ? _parseMoney(fixed.leadsAugeGrupo) : null,
        leadsPico: isExtra ? _parseMoney(fixed.leadsPico) : null,
        vendas: isExtra ? _parseMoney(fixed.vendas) : null,
        faturamento: isExtra ? _parseMoney(fixed.faturamento) : null,
        investimento: null
      }
    };

    if(isExtra && row){
      row.querySelectorAll(".compare-input").forEach(function(input){
        input.addEventListener("blur", function(){
          var patch = { results: {} };
          patch.results[input.dataset.rkey] = input.value;
          setDoc(wDocRef, patch, { merge: true }).catch(function(err){
            console.warn("Não deu pra salvar o comparativo de " + w.id, err);
          });
        });
        input.addEventListener("input", function(){
          _compareRowData[w.id].values.investimento = _parseMoney(input.value);
          _updateCompareRoi(w.id);
        });
      });
    }

    var unsub = onSnapshot(wDocRef, function(snap){
      var results = (snap.exists() ? snap.data().results : {}) || {};
      var thisRow = document.getElementById("compare-row-" + w.id);
      if(!thisRow) return;
      if(isExtra){
        thisRow.querySelectorAll(".compare-input").forEach(function(input){
          if(document.activeElement !== input){
            var val = results[input.dataset.rkey];
            val = (val === undefined || val === null) ? "" : String(val);
            if(input.value !== val) input.value = val;
          }
          if(input.dataset.rkey === "investimento"){
            _compareRowData[w.id].values.investimento = _parseMoney(input.value);
          }
        });
      }else{
        var cells = thisRow.querySelectorAll("td");
        _RESULT_COLS.forEach(function(col, i){
          var val = results[col];
          cells[i + 1].textContent = (val === undefined || val === null || val === "") ? "-" : val;
          _compareRowData[w.id].values[col] = _parseMoney(val);
        });
      }
      _updateCompareRoi(w.id);
    }, function(err){
      console.warn("Não deu pra carregar o comparativo de " + w.id, err);
    });
    _compareUnsubs.push(unsub);
  });

  _renderCompareChart();
}

// ── GRÁFICO DE PERFORMANCE (qual workshop performou melhor em cada
// indicador) ───────────────────────────────────────────────────────
// Um mini-gráfico por indicador (não um gráfico por workshop): dentro
// de cada um, uma coluna por workshop, pra comparar direto quem foi
// melhor naquele indicador específico. Cada workshop usa sempre a
// mesma cor em todos os mini-gráficos.
var _COMPARE_METRICS = [
  { key: "leads", label: "Leads totais" },
  { key: "leadsAugeGrupo", label: "Leads no auge do grupo" },
  { key: "leadsPico", label: "Leads no pico de audiência" },
  { key: "vendas", label: "Vendas" },
  { key: "faturamento", label: "Faturamento" },
  { key: "investimento", label: "Investimento" },
  { key: "roi", label: "ROI" }
];
var _WORKSHOP_PALETTE = ["#d9a94e", "#5b8def", "#4fd1c5", "#25d366", "#f2a65a", "#e2665f", "#a78bfa", "#f472b6"];
var _MINI_BAR_TRACK_PX = 96; // precisa bater com a altura de .mini-bar-track no CSS

// Abreviação do "tipo" do workshop, pro rótulo embaixo de cada coluna
// não ficar enorme. A data (que já vem no nome, "· DD/MM/AAAA") continua,
// só encurtada pra "DD/MM", porque é ela que diferencia duas edições
// do mesmo tipo (ex: os dois workshops de Planejamento Previdenciário).
var _WORKSHOP_ABBR = [
  { match: /aux[ií]lio\s+maternidade/i, abbr: "AM" },
  { match: /sa[ií]da\s+fiscal/i, abbr: "SF" },
  { match: /aposentadoria/i, abbr: "PP" },
  { match: /traslado\s+de\s+registro\s+civil/i, abbr: "TRC" },
  { match: /planejamento\s+previdenci[aá]rio/i, abbr: "PP" }
];
function _abbreviateWorkshopName(fullName){
  var parts = String(fullName || "").split(" · ");
  var datePart = null;
  if(parts.length > 1 && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(parts[parts.length - 1].trim())){
    datePart = parts.pop().trim();
  }
  var typePart = parts[parts.length - 1] || fullName;
  var abbr = null;
  for(var i = 0; i < _WORKSHOP_ABBR.length; i++){
    if(_WORKSHOP_ABBR[i].match.test(typePart)){ abbr = _WORKSHOP_ABBR[i].abbr; break; }
  }
  if(!abbr) abbr = typePart.length > 14 ? typePart.slice(0, 13) + "…" : typePart;
  if(datePart){
    var shortDate = datePart.split("/").slice(0, 2).join("/");
    return abbr + " · " + shortDate;
  }
  return abbr;
}

function _renderCompareChart(){
  var container = document.getElementById("compare-chart");
  if(!container) return;

  var rowEls = Array.prototype.slice.call(document.querySelectorAll("#compare-tbody tr"));
  var data = rowEls.map(function(tr, i){
    var rowId = tr.id.replace("compare-row-", "");
    var d = _compareRowData[rowId] || {};
    var v = d.values || {};
    var roi = (v.faturamento === null || v.faturamento === undefined || v.investimento === null || v.investimento === undefined)
      ? null : (v.faturamento - v.investimento);
    return {
      label: _abbreviateWorkshopName(d.name || ""),
      color: _WORKSHOP_PALETTE[i % _WORKSHOP_PALETTE.length],
      values: {
        leads: v.leads, leadsAugeGrupo: v.leadsAugeGrupo, leadsPico: v.leadsPico,
        vendas: v.vendas, faturamento: v.faturamento, investimento: v.investimento, roi: roi
      }
    };
  }).filter(function(d){
    return _COMPARE_METRICS.some(function(m){
      var v = d.values[m.key];
      return v !== null && v !== undefined;
    });
  });

  if(!data.length){
    container.innerHTML = '<div class="compare-chart-empty">Preencha algum resultado pra ver o gráfico.</div>';
    return;
  }

  var legend = data.map(function(d){
    return '<span class="cc-dot" style="background:' + d.color + '"></span>' + _escapeHtml(d.label);
  }).join("");

  var minis = _COMPARE_METRICS.map(function(m){
    var vals = data.map(function(d){ return d.values[m.key]; }).filter(function(v){ return v !== null && v !== undefined; });
    if(!vals.length) return "";
    var maxVal = Math.max.apply(null, vals.concat([1]).map(Math.abs));
    var cols = data.map(function(d){
      var val = d.values[m.key];
      var has = val !== null && val !== undefined;
      // altura em px direto (não %), porque % dentro de flex-column
      // aninhado (coluna > track > barra) não resolvia direito: a
      // barra do maior valor renderizava do mesmo tamanho que outras
      // bem menores. Em px, contra uma faixa (.mini-bar-track) de
      // altura fixa, o cálculo fica exato.
      var barPx = has ? Math.max(3, Math.round(Math.abs(val) / maxVal * _MINI_BAR_TRACK_PX)) : 0;
      var neg = has && val < 0;
      return '' +
        '<div class="mini-bar-col">' +
          '<div class="mini-bar-value">' + (has ? _formatCompact(val) : "-") + '</div>' +
          '<div class="mini-bar-track">' +
            '<div class="mini-bar' + (neg ? ' mini-bar-neg' : '') + '" style="height:' + barPx + 'px;background:' + d.color + '"></div>' +
          '</div>' +
          '<div class="mini-bar-label">' + _escapeHtml(d.label) + '</div>' +
        '</div>';
    }).join("");
    return '<div class="compare-mini-chart"><h4 class="mini-title">' + _escapeHtml(m.label) + '</h4><div class="mini-bars">' + cols + '</div></div>';
  }).join("");

  container.innerHTML =
    '<div class="compare-chart-legend">' + legend + '</div>' +
    '<div class="compare-mini-grid">' + minis + '</div>';
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
  setupDayCardCopyButtons();
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

// ── COPIAR MENSAGEM INTEIRA (botão nas fichas de dia) ──────────────
// Converte o HTML de uma bolha em texto puro: <br> vira quebra de linha,
// <li> vira "- item", o resto das tags é descartado mas o texto fica.
function _htmlToPlainText(html){
  var div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll("br").forEach(function(br){ br.replaceWith("\n"); });
  div.querySelectorAll("li").forEach(function(li){
    li.prepend("- ");
    li.append("\n");
  });
  return div.textContent.replace(/\n{3,}/g, "\n\n").trim();
}

// Enquete e bolha de botões não são texto corrido, têm campos próprios
// (pergunta + opções, ou só as opções), então viram texto linha a linha.
function _bubbleToText(bubble){
  var pollQuestion = bubble.querySelector(".poll-question");
  if(pollQuestion){
    var lines = [];
    var pollTitle = bubble.querySelector(".poll-title");
    if(pollTitle) lines.push(pollTitle.textContent.trim());
    lines.push(pollQuestion.textContent.trim());
    bubble.querySelectorAll(".poll-opt").forEach(function(opt){
      lines.push("- " + opt.textContent.trim());
    });
    return lines.join("\n");
  }
  var btnOpts = bubble.querySelectorAll(".btn-opt");
  if(btnOpts.length){
    var blines = [];
    btnOpts.forEach(function(opt){ blines.push("- " + opt.textContent.trim()); });
    return blines.join("\n");
  }
  return _htmlToPlainText(bubble.innerHTML);
}

// Junta todas as bolhas de uma ficha (uma mensagem inteira, não balão
// por balão) numa string só, cada bolha separada por linha em branco.
function _dayCardToText(card){
  var body = card.querySelector(".day-body");
  if(!body) return "";
  var parts = [];
  body.querySelectorAll(":scope > .bubble").forEach(function(b){
    var t = _bubbleToText(b);
    if(t) parts.push(t);
  });
  return parts.join("\n\n");
}

function _copyToClipboard(text){
  if(navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(text).catch(function(){
      return _copyFallback(text);
    });
  }
  return _copyFallback(text);
}

function _copyFallback(text){
  return new Promise(function(resolve){
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try{ document.execCommand("copy"); }catch(e){}
    document.body.removeChild(ta);
    resolve();
  });
}

// Ícone sutil de "duas folhinhas" no canto de cada ficha, pra copiar a
// mensagem inteira de uma vez (não balão por balão).
function setupDayCardCopyButtons(){
  document.querySelectorAll(".day-card").forEach(function(card){
    if(card.querySelector(".copy-msg-btn")) return;
    var header = card.querySelector(".day-header");
    if(!header) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "copy-msg-btn";
    btn.title = "Copiar mensagem inteira";
    btn.setAttribute("aria-label", "Copiar mensagem inteira");
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    btn.addEventListener("click", function(e){
      e.stopPropagation();
      var text = _dayCardToText(card);
      var originalTitle = btn.title;
      _copyToClipboard(text).then(function(){
        btn.classList.add("copied");
        btn.title = "Copiado!";
        setTimeout(function(){
          btn.classList.remove("copied");
          btn.title = originalTitle;
        }, 1600);
      });
    });
    header.appendChild(btn);
  });
}

// Campos numéricos da aba "Resultados por Workshop": salvam ao sair do
// campo, sincronizados ao vivo pelo mesmo documento do workshop atual.
function setupResultsPanel(){
  _resultInputs = Array.prototype.slice.call(document.querySelectorAll(".result-input"));
  _resultInputs.forEach(function(input){
    input.addEventListener("blur", function(){
      _saveRemoteResult(input.dataset.rkey, input.value);
      var field = input.closest(".link-field");
      if(field) _syncLinkFieldView(field);
    });
  });
  setupLinkFields();
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
    { sel: ".bubble:not(.poll):not(.buttons):not(.linkonly)", tag: "b" },
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
