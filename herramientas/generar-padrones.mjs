// Junta Electoral · IEM "Dr. Arturo Oñativia"
// Genera assets/data/padrones.js a partir de los PDF de los padrones definitivos.
//
//   node herramientas/generar-padrones.mjs [padron-alumnos.pdf] [padron-padres.pdf]
//
// Requiere pdftotext (paquete poppler-utils). Los PDF originales NO se publican:
// traen nombre y DNI de alumnos menores de edad (Ley 26.061 y Ley 25.326).
//
// Qué se publica:
// - Alumnos: ningún nombre ni DNI. Sólo el total por curso y, por cada alumno, un
//   registro cifrado (curso, número de orden e iniciales) que se abre únicamente con
//   su DNI. El identificador y la clave salen de PBKDF2(DNI); los registros van
//   ordenados por ese identificador, así que su posición no delata el curso.
// - Padres o Tutores: nombre y número de orden, como el padrón impreso, pero sin DNI.
//   El DNI sólo sirve para buscar (mismo PBKDF2, sin nada cifrado detrás).
//
// Un DNI tiene pocas cifras: con tiempo y hardware se puede probar la lista entera.
// PBKDF2 encarece eso, pero la protección real es que el registro de un alumno dice
// lo mínimo para votar y nada que permita ubicarlo.

import { execFileSync } from "node:child_process";
import { webcrypto, randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets/data/padrones.js");
const ALUMNOS_PDF = process.argv[2] || join(ROOT, "PADRON DEFINITIVOS DE ALUMNOS 2026.pdf");
const PADRES_PDF = process.argv[3] || join(ROOT, "PADRON DEFINITIVOS DE PADRES 2026.pdf");

// Igual que en assets/js/padrones.js. Unos 0,3–1 s por consulta en un teléfono.
const ITERACIONES = 600000;
const PAYLOAD_BYTES = 96; // todos los registros cifrados miden lo mismo

// El pool de libuv se crea con la primera derivación; hasta entonces se puede agrandar.
process.env.UV_THREADPOOL_SIZE ||= "8";

const { subtle } = webcrypto;
const enc = new TextEncoder();

function fail(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

function pdfText(file) {
  try {
    return execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" });
  } catch (e) {
    fail("No se pudo leer " + file + (e.code === "ENOENT" ? " (¿falta pdftotext?)" : ": " + e.message));
  }
}

function normDni(s) {
  return s.replace(/\D/g, "").replace(/^0+/, "");
}

const NOISE = /Instituto de Educ|Dr\. Arturo|U\.N\.Sa|PADR[ÓO]N DEFINIT|DE (ALUMNOS|PADRES)|Periodo Lectivo|Apellido y Nombre|Página|^\s*$/;

// ----- Alumnos -----

function parseAlumnos(text) {
  const rows = [];
  let curso = null;
  for (const line of text.split("\n")) {
    const c = line.match(/Curso y Divisi[óo]n\s+(\d)\D+?\s+(\d)\D*$/);
    if (c) {
      curso = { anio: +c[1], div: +c[2] };
      continue;
    }
    if (NOISE.test(line)) continue;
    const m = line.match(/^\s*(\d+)\s{2,}(\S.*?)\s{2,}(\d{1,2}\.\d{3}\.\d{3})\s*$/);
    if (!m) fail("Fila de alumnos que no se entiende (¿trae observaciones?):\n  " + line.trim());
    if (!curso) fail("Fila de alumnos antes de cualquier curso: " + line.trim());
    rows.push({ ...curso, orden: +m[1], nombre: m[2], dni: normDni(m[3]) });
  }
  return rows;
}

const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y"]);
function iniciales(nombre) {
  const part = (s) =>
    s.split(/\s+/).filter((w) => w && !PARTICULAS.has(w.toLowerCase()))
      .map((w) => w[0].toUpperCase() + ".").join(" ");
  const [apellidos, nombres] = nombre.split(",");
  return nombres ? part(apellidos) + ", " + part(nombres) : part(apellidos);
}

// ----- Padres o Tutores -----

function parsePadres(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (NOISE.test(line) || /N° Orden/.test(line)) continue;
    const m = line.match(/^\s*(\d+)\s{2,}(\S.*?)\s{2,}(\d{6,8})\s*$/);
    if (!m) fail("Fila de padres que no se entiende (¿trae observaciones?):\n  " + line.trim());
    rows.push({ orden: +m[1], nombre: m[2], dni: normDni(m[3]) });
  }
  return rows;
}

// ----- Controles -----

function checkNumeracion(rows, label) {
  let prev = null;
  for (const r of rows) {
    const key = r.anio ? r.anio + "/" + r.div : "";
    const expected = prev && prev.key === key ? prev.orden + 1 : 1;
    if (r.orden !== expected) fail(label + ": se esperaba el Nº " + expected + " y vino el " + r.orden + " (" + r.nombre + ")");
    prev = { key, orden: r.orden };
  }
}

function checkDnisUnicos(rows, label) {
  const seen = new Map();
  for (const r of rows) {
    if (seen.has(r.dni)) fail(label + ": DNI repetido en " + seen.get(r.dni) + " y " + r.nombre);
    seen.set(r.dni, r.nombre);
  }
}

// ----- Cifrado (lo mismo que hace assets/js/padrones.js al consultar) -----

const b64 = (buf) => Buffer.from(buf).toString("base64");
const hex = (buf) => Buffer.from(buf).toString("hex");

async function derivar(dni, sal) {
  const base = await subtle.importKey("raw", enc.encode(dni), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await subtle.deriveBits(
    { name: "PBKDF2", salt: sal, iterations: ITERACIONES, hash: "SHA-256" }, base, 384));
  return { id: hex(bits.slice(0, 16)), clave: bits.slice(16, 48) };
}

async function cifrar(clave, datos) {
  const json = JSON.stringify(datos);
  const bytes = enc.encode(json);
  if (bytes.length > PAYLOAD_BYTES) fail("Registro demasiado largo para el relleno: " + json);
  const plano = new Uint8Array(PAYLOAD_BYTES).fill(0x20); // espacios: JSON.parse los ignora
  plano.set(bytes);
  const key = await subtle.importKey("raw", clave, "AES-GCM", false, ["encrypt"]);
  const iv = randomBytes(12);
  return [b64(iv), b64(await subtle.encrypt({ name: "AES-GCM", iv }, key, plano))];
}

// Pocas a la vez: cada derivación ocupa un hilo del pool de libuv.
async function mapLimit(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

function porId(pares) {
  return Object.fromEntries(pares.sort((a, b) => (a[0] < b[0] ? -1 : 1)));
}

// ----- Principal -----

const alumnos = parseAlumnos(pdfText(ALUMNOS_PDF));
const padres = parsePadres(pdfText(PADRES_PDF));
checkNumeracion(alumnos, "Alumnos");
checkNumeracion(padres, "Padres");
checkDnisUnicos(alumnos, "Alumnos");
checkDnisUnicos(padres, "Padres");

const cursos = [];
for (const a of alumnos) {
  const last = cursos[cursos.length - 1];
  if (last && last.anio === a.anio && last.div === a.div) last.total++;
  else cursos.push({ anio: a.anio, div: a.div, total: 1 });
}

const salAlumnos = randomBytes(16);
const salPadres = randomBytes(16);
const t0 = Date.now();

const regAlumnos = await mapLimit(alumnos, 8, async (a) => {
  const { id, clave } = await derivar(a.dni, salAlumnos);
  return [id, await cifrar(clave, { a: a.anio, d: a.div, n: a.orden, i: iniciales(a.nombre) })];
});
const regPadres = await mapLimit(padres, 8, async (p) => [(await derivar(p.dni, salPadres)).id, p.orden]);

const data = {
  fecha: "2026-09-25",
  kdf: { hash: "SHA-256", iteraciones: ITERACIONES },
  alumnos: { total: alumnos.length, cursos, sal: b64(salAlumnos), dni: porId(regAlumnos) },
  padres: { total: padres.length, sal: b64(salPadres), nomina: padres.map((p) => p.nombre), dni: porId(regPadres) },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT,
  "// Padrones definitivos 2026 · Junta Electoral IEM \"Dr. Arturo Oñativia\"\n" +
  "// Generado por herramientas/generar-padrones.mjs. No editar a mano.\n" +
  "// Sin nombres ni DNI de alumnos: ver el encabezado de ese script.\n" +
  "window.PADRONES = " + JSON.stringify(data) + ";\n");

console.log("✓ " + alumnos.length + " alumnos en " + cursos.length + " cursos, " + padres.length +
  " padres o tutores (" + ((Date.now() - t0) / 1000).toFixed(1) + " s) → " + OUT);
