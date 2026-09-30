// Junta Electoral · IEM "Dr. Arturo Oñativia"
// Marca las etapas del cronograma según la fecha de hoy (hora de Salta, UTC−3).

(function () {
  "use strict";

  var TZ = "-03:00";
  var ELECTION = new Date("2026-10-26T00:00:00" + TZ);
  var DAY = 24 * 60 * 60 * 1000;

  // Permite previsualizar otra fecha: index.html?hoy=2026-10-26T10:00
  var override = new URLSearchParams(location.search).get("hoy");
  var now = override ? new Date(override + (override.length <= 16 ? ":00" : "") + TZ) : new Date();
  if (isNaN(now)) now = new Date();

  function at(value) { return new Date(value + ":00" + TZ); }

  // ----- Menú móvil -----
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // ----- Video -----
  // Sin menú contextual para que no ofrezca "Guardar video como…". Con reducción de
  // movimiento activada en el sistema no arranca solo; queda con los controles a mano.
  var video = document.getElementById("video-je");
  if (video) {
    video.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) {
      video.removeAttribute("autoplay");
      video.pause();
    }
  }

  // ----- Cronograma -----
  var items = Array.prototype.slice.call(document.querySelectorAll("#timeline li"));
  var focus = null;

  items.forEach(function (li) {
    var start = at(li.dataset.start);
    var end = at(li.dataset.end);
    var kind = li.dataset.kind;
    var label = null;

    if (now > end) {
      li.classList.add("is-done");
      label = "Cumplida";
    } else if (!focus) {
      focus = li;
      li.classList.add("is-current");
      if (now >= start) {
        label = kind === "day" ? "Hoy" : kind === "range" ? "En curso" : "Plazo abierto";
      } else {
        label = "Próxima";
      }
    }

    if (label) {
      var tag = document.createElement("span");
      tag.className = "status";
      tag.textContent = label;
      li.querySelector("h3").appendChild(tag);
    }
  });

  // ----- Tarjeta de portada -----
  var box = document.getElementById("etapa-actual");
  if (box) {
    var kicker = box.querySelector(".card-kicker");
    var title = document.getElementById("etapa-titulo");
    var date = document.getElementById("etapa-fecha");
    if (focus) {
      var open = now >= at(focus.dataset.start);
      kicker.textContent = open ? "Etapa en curso" : "Próxima etapa";
      title.textContent = focus.querySelector("h3").firstChild.textContent.trim();
      var detail = focus.querySelector(".t-body p").textContent.trim();
      date.textContent = focus.querySelector(".t-date").textContent.trim() + " · " + detail;
    } else {
      kicker.textContent = "Proceso concluido";
      title.textContent = "Candidatos proclamados";
      date.textContent = "La Junta Electoral se expidió el 30/10/2026.";
    }
  }

  // ----- Cuenta regresiva (en días, sin hora de apertura publicada) -----
  var countdown = document.getElementById("countdown");
  if (countdown) {
    var today = new Date(now.getTime() - 3 * 60 * 60 * 1000); // fecha civil en Salta
    var todayMidnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) + 3 * 60 * 60 * 1000;
    var days = Math.round((ELECTION.getTime() - todayMidnight) / DAY);
    var text = null;
    if (days > 1) text = "Faltan " + days + " días";
    else if (days === 1) text = "Es mañana";
    else if (days === 0) text = "Hoy se vota";
    if (text) {
      countdown.textContent = text;
      countdown.hidden = false;
    }
  }
})();
