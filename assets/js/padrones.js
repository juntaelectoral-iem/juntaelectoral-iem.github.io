// Junta Electoral · IEM "Dr. Arturo Oñativia"
// Consulta de los padrones definitivos.
//
// Los datos (assets/data/padrones.js) se cargan recién cuando la sección está por verse.
// Alumnos: no hay nómina publicada; con el DNI se deriva (PBKDF2) el identificador y la
// clave del registro, y sólo ese registro se descifra. El DNI no sale del dispositivo.
// Padres o Tutores: la nómina es visible; el DNI sólo sirve para buscar, nunca se muestra.
// Detalle del esquema en herramientas/generar-padrones.mjs.

(function () {
  "use strict";

  var section = document.getElementById("padrones");
  if (!section) return;

  var DATA_URL = "assets/data/padrones.js";
  var subtle = window.crypto && window.crypto.subtle;
  var enc = new TextEncoder();

  // ----- Carga diferida de los datos -----

  var dataPromise = null;
  function loadData() {
    if (!dataPromise) {
      dataPromise = new Promise(function (resolve, reject) {
        if (window.PADRONES) return resolve(window.PADRONES);
        var s = document.createElement("script");
        s.src = DATA_URL;
        s.onload = function () { window.PADRONES ? resolve(window.PADRONES) : reject(new Error("sin datos")); };
        s.onerror = function () { dataPromise = null; s.remove(); reject(new Error("no cargó")); };
        document.head.appendChild(s);
      });
    }
    return dataPromise;
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) {
        io.disconnect();
        loadData().then(renderSummary, showLoadError);
      }
    }, { rootMargin: "600px 0px" });
    io.observe(section);
  } else {
    loadData().then(renderSummary, showLoadError);
  }

  function showLoadError() {
    section.querySelectorAll("[data-load-error]").forEach(function (el) {
      el.textContent = "No se pudo cargar el padrón. Revisá la conexión y recargá la página.";
      el.hidden = false;
    });
  }

  // ----- Utilidades -----

  function onlyDigits(s) { return s.replace(/[\s.\-]/g, ""); }
  function normDni(s) { return s.replace(/\D/g, "").replace(/^0+/, ""); }
  function isDniLike(s) { return /^\d+$/.test(onlyDigits(s)); }

  function fromB64(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function toHex(bytes) {
    var out = "";
    for (var i = 0; i < bytes.length; i++) out += (bytes[i] < 16 ? "0" : "") + bytes[i].toString(16);
    return out;
  }

  // Igual que en herramientas/generar-padrones.mjs: 16 bytes de identificador + 32 de clave.
  async function derive(dni, salB64, kdf) {
    var base = await subtle.importKey("raw", enc.encode(dni), "PBKDF2", false, ["deriveBits"]);
    var bits = new Uint8Array(await subtle.deriveBits(
      { name: "PBKDF2", salt: fromB64(salB64), iterations: kdf.iteraciones, hash: kdf.hash }, base, 384));
    return { id: toHex(bits.subarray(0, 16)), key: bits.slice(16, 48) };
  }

  function ordinal(n, fem) { return n + (fem ? "ª" : "º"); }
  function cursoLabel(anio, div) { return ordinal(anio) + " año · " + ordinal(div, true) + " división"; }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function fmt(n) { return n.toLocaleString("es-AR"); }

  // ----- Resumen: totales y alumnos por curso -----

  function renderSummary(data) {
    section.querySelectorAll("[data-total]").forEach(function (node) {
      var t = data[node.dataset.total].total;
      node.textContent = fmt(t) + " empadronados";
    });

    var table = document.getElementById("alumnos-por-curso");
    if (!table) return;
    var divs = [];
    var byYear = {};
    data.alumnos.cursos.forEach(function (c) {
      if (divs.indexOf(c.div) < 0) divs.push(c.div);
      (byYear[c.anio] = byYear[c.anio] || {})[c.div] = c.total;
    });
    divs.sort();

    var head = table.createTHead().insertRow();
    head.appendChild(el("th", null, "Año")).scope = "col";
    divs.forEach(function (d) { head.appendChild(el("th", null, ordinal(d, true) + " div.")).scope = "col"; });
    head.appendChild(el("th", null, "Total")).scope = "col";

    var body = table.createTBody();
    Object.keys(byYear).sort().forEach(function (anio) {
      var row = body.insertRow();
      row.appendChild(el("th", null, ordinal(anio) + " año")).scope = "row";
      var sum = 0;
      divs.forEach(function (d) {
        var v = byYear[anio][d];
        sum += v || 0;
        row.appendChild(el("td", null, v == null ? "—" : fmt(v)));
      });
      row.appendChild(el("td", "is-total", fmt(sum)));
    });

    var foot = table.createTFoot().insertRow();
    foot.appendChild(el("th", null, "Total")).scope = "row";
    divs.forEach(function (d) {
      var sum = 0;
      Object.keys(byYear).forEach(function (a) { sum += byYear[a][d] || 0; });
      foot.appendChild(el("td", null, fmt(sum)));
    });
    foot.appendChild(el("td", "is-total", fmt(data.alumnos.total)));
    table.hidden = false;
  }

  // ----- Alumnos: consulta por DNI -----

  var formA = document.getElementById("buscar-alumno");
  var inputA = document.getElementById("dni-alumno");
  var outA = document.getElementById("resultado-alumno");
  var busyA = false;

  function showResult(kind, title, lines, details) {
    outA.replaceChildren();
    var box = el("div", "result is-" + kind);
    box.appendChild(el("p", "result-title", title));
    if (details) {
      var dl = el("dl");
      details.forEach(function (d) {
        dl.appendChild(el("dt", null, d[0]));
        dl.appendChild(el("dd", null, d[1]));
      });
      box.appendChild(dl);
    }
    (lines || []).forEach(function (t) { box.appendChild(el("p", null, t)); });
    outA.appendChild(box);
  }

  if (formA) {
    inputA.addEventListener("input", function () { if (!busyA) outA.replaceChildren(); });

    formA.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (busyA) return;
      var raw = inputA.value.trim();
      var dni = normDni(raw);
      if (!raw || !isDniLike(raw) || dni.length < 7 || dni.length > 8) {
        showResult("warn", "Revisá el número", ["Ingresá el DNI completo, con 7 u 8 números, sin letras."]);
        inputA.focus();
        return;
      }
      if (!subtle) {
        showResult("warn", "Este navegador no permite la consulta",
          ["Probá con una versión actual de Chrome, Firefox, Safari o Edge."]);
        return;
      }

      var button = formA.querySelector("button");
      busyA = true;
      button.disabled = true;
      button.textContent = "Consultando…";
      outA.replaceChildren(el("p", "result-wait", "Consultando el padrón…"));

      try {
        var data = await loadData();
        var p = data.alumnos;
        var d = await derive(dni, p.sal, data.kdf);
        var reg = p.dni[d.id];
        if (!reg) {
          showResult("miss", "Ese DNI no figura en el padrón de alumnos", [
            "Revisá que el número esté bien escrito. Si es correcto y creés que se trata de un error, consultá a la Junta Electoral en el IEM."
          ]);
        } else {
          var key = await subtle.importKey("raw", d.key, "AES-GCM", false, ["decrypt"]);
          var plain = await subtle.decrypt({ name: "AES-GCM", iv: fromB64(reg[0]) }, key, fromB64(reg[1]));
          var r = JSON.parse(new TextDecoder().decode(plain));
          showResult("ok", "Figura en el padrón definitivo de alumnos", null, [
            ["Curso y división", cursoLabel(r.a, r.d)],
            ["Número de orden", String(r.n)],
            ["Iniciales", r.i]
          ]);
        }
      } catch (err) {
        showResult("warn", "No se pudo hacer la consulta", ["Revisá la conexión y volvé a intentar."]);
      } finally {
        busyA = false;
        button.disabled = false;
        button.textContent = "Consultar";
      }
    });
  }

  // ----- Padres o Tutores: nómina y búsqueda -----

  var inputP = document.getElementById("q-padre");
  var countP = document.getElementById("conteo-padres");
  var wrapP = document.getElementById("tabla-padres");
  var listP = wrapP && wrapP.querySelector("tbody");
  var allBtn = document.getElementById("ver-padres");
  var showAll = false;
  var normNames = null;
  var searchSeq = 0;
  var timer = null;

  function norm(s) {
    return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function renderRows(data, orders) {
    var frag = document.createDocumentFragment();
    orders.forEach(function (n) {
      var row = document.createElement("tr");
      row.appendChild(el("td", "num", String(n)));
      row.appendChild(el("td", null, data.padres.nomina[n - 1]));
      frag.appendChild(row);
    });
    listP.replaceChildren(frag);
    wrapP.hidden = orders.length === 0;
    wrapP.scrollTop = 0;
  }

  function setCount(text) { countP.textContent = text; }

  async function searchPadres() {
    var seq = ++searchSeq;
    var q = inputP.value.trim();
    var data;
    try { data = await loadData(); } catch (e) { showLoadError(); return; }
    if (seq !== searchSeq) return;
    var total = data.padres.nomina.length;

    if (!q) {
      if (showAll) {
        renderRows(data, data.padres.nomina.map(function (_, i) { return i + 1; }));
        setCount("Padrón completo: " + fmt(total) + " personas, por orden alfabético.");
      } else {
        renderRows(data, []);
        setCount("");
      }
      return;
    }

    if (isDniLike(q)) {
      var dni = normDni(q);
      if (dni.length < 7) {
        renderRows(data, []);
        setCount("Para buscar por DNI, ingresalo completo (7 u 8 números).");
        return;
      }
      if (!subtle) {
        setCount("Este navegador no permite buscar por DNI. Buscá por apellido.");
        return;
      }
      setCount("Buscando…");
      var d;
      try { d = await derive(dni, data.padres.sal, data.kdf); } catch (e) { setCount("No se pudo buscar ese DNI."); return; }
      if (seq !== searchSeq) return;
      var orden = data.padres.dni[d.id];
      renderRows(data, orden ? [orden] : []);
      setCount(orden ? "Ese DNI figura en el padrón." : "Ese DNI no figura en el padrón de padres o tutores.");
      return;
    }

    var tokens = norm(q).split(" ").filter(Boolean);
    if (!tokens.length || tokens.join("").length < 2) {
      renderRows(data, []);
      setCount("Escribí al menos dos letras.");
      return;
    }
    normNames = normNames || data.padres.nomina.map(norm);
    var hits = [];
    normNames.forEach(function (name, i) {
      if (tokens.every(function (t) { return name.indexOf(t) >= 0; })) hits.push(i + 1);
    });
    renderRows(data, hits);
    setCount(hits.length === 0
      ? "Sin resultados para “" + q + "”."
      : hits.length === 1 ? "1 resultado." : fmt(hits.length) + " resultados.");
  }

  if (inputP && listP) {
    inputP.addEventListener("input", function () {
      clearTimeout(timer);
      // Por DNI cada búsqueda cuesta una derivación: se espera a que termine de escribir.
      timer = setTimeout(searchPadres, isDniLike(inputP.value.trim()) ? 450 : 120);
    });
    inputP.form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearTimeout(timer);
      searchPadres();
    });
    if (allBtn) {
      allBtn.addEventListener("click", function () {
        showAll = !showAll;
        allBtn.setAttribute("aria-expanded", String(showAll));
        allBtn.textContent = showAll ? "Ocultar el padrón completo" : "Ver el padrón completo";
        if (showAll) inputP.value = "";
        searchPadres();
      });
    }
  }
})();
