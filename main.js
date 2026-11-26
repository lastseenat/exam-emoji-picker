// Outils hospit : fichier généré par build.cjs à partir de src/, ne pas le modifier directement

// ===== Boutons Copier : à côté des titres et de chaque jour d'hospitalisation (mode lecture) (src/copier.js) =====
const module_copier = (function () {
  const module = { exports: {} };
const { MarkdownView, Notice, Plugin, TFile, setIcon } = require("obsidian");

// ---------- Texte à copier (même règles que le bloc « À copier » du modèle hospit) ----------

const clean = (s) =>
  s
    .replace(/==|\*\*|__|~~/g, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, a, b) => b || a)
    .trim();
// Texte simple : sans <br> ni italique
const flat = (s) =>
  clean(s.replace(/<br\s*\/?>/gi, ", "))
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .replace(/^,\s*|,\s*$/g, "")
    .trim();
// Minuscule au premier mot, sauf sigle (PR, CHU, IDE…)
const lowerFirst = (s) =>
  /^\p{Lu}\p{Ll}/u.test(s) && !/^(Dr|Pr|Mme|Mr)\b/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
const upperFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// 1re case d'antécédent : ce qui suit un <br> (la date) passe entre parenthèses
function atcdName(s) {
  const [main, ...more] = s.split(/<br\s*\/?>/i).map(flat).filter(Boolean);
  // Date déjà écrite entre parenthèses « (06/2023) » : pas de parenthèses doublées
  const dates = more.map((x) => lowerFirst(x.replace(/^\((.*)\)$/, "$1").trim()));
  return more.length ? `${main} (${dates.join(", ")})` : main || "";
}
const BULLET = /^\s*[-*+]\s+(\[[ xX]\]\s+)?/;
const HEADING = /^#{1,6}\s/;
const isTable = (l) => /^\s*\|/.test(l);
const isSep = (l) => /^\s*\|[\s|:-]+\|\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|");
const isTitle = (c) => c.length > 1 && c.slice(1).every((x) => x.trim() === "<" || x.trim() === "^");

// Lignes situées sous le titre de la ligne `start`, jusqu'au titre suivant
function sectionAt(lines, start) {
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (HEADING.test(lines[i].trim())) break;
    out.push(lines[i]);
  }
  return out;
}

// Antécédents : titre en majuscules, puis « - case 1 : case 2, case 3 »
function antecedents(ls) {
  const out = [];
  let prevTable = false;
  for (const l of ls) {
    const table = isTable(l);
    const first = table && !prevTable;
    prevTable = table;
    if (!l.trim() || isSep(l)) continue;
    if (!table) {
      const t = flat(l.replace(BULLET, ""));
      if (t) out.push("- " + t);
      continue;
    }
    const c = cells(l);
    if (isTitle(c)) {
      if (out.length) out.push(""); // ligne vide avant chaque titre sauf le premier
      out.push(flat(c[0]).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").trim().toUpperCase()); // titre sans émoji
      continue;
    }
    if (first) continue; // en-tête d'un ancien tableau (ATCD | Détails)
    const a = atcdName(c[0]);
    // un seul « : » par ligne : les suivants deviennent des virgules
    const r = lowerFirst(c.slice(1).map(flat).filter(Boolean).join(", ")).replace(/\s*:\s*/g, ", ");
    if (a || r) out.push("- " + (a && r ? `${a} : ${r}` : a || r));
  }
  return out.some((l) => l.startsWith("- ")) ? out.join("\n") : "";
}

// Histoire de la maladie : une ligne par puce principale, sans gras ;
// ses sous-puces (et sous-sous-puces) à la suite, en phrases : « - Mercredi 25/11 : Chute. Cs SAU : souffle, 38.5. ECG en cours. »
function histoire(ls) {
  const close = (s) => (/[.!?…]$/.test(s) ? s : s + ".");
  const out = [];
  const avecSuite = new Set(); // lignes qui ont reçu des sous-puces : terminées par un point
  for (const raw of ls) {
    const l = raw.replace(/==|\*\*|__|~~/g, "").trimEnd();
    const t = l.trim();
    if (!t || t === "-") continue;
    if (!/^\s/.test(l) || !out.length) {
      out.push(t);
      continue;
    }
    const s = upperFirst(t.replace(BULLET, "").trim());
    if (!s) continue;
    const k = out.length - 1;
    // Après « Mercredi 25/11 : » la première phrase suit directement ; sinon la phrase précédente est close par un point
    out[k] = /:$/.test(out[k]) ? out[k] + " " + s : close(out[k]) + " " + s;
    avecSuite.add(k);
  }
  return out.map((l, k) => (avecSuite.has(k) ? close(l) : l)).join("\n");
}

// Traitement habituel : nom du médicament, et « : posologie » si la 2e colonne est remplie
function traitementHabituel(ls) {
  const rows = ls.filter((l) => isTable(l) || !l.trim());
  const start = rows.findIndex((l) => isTable(l) && /habituel/i.test(l));
  const names = [];
  for (let i = start < 0 ? 0 : start + 1; i < rows.length; i++) {
    const l = rows[i];
    if (!isTable(l)) {
      if (start >= 0) break;
      continue;
    }
    if (isSep(l)) continue;
    // Tableau unique « Traitement » (pas de tableau « habituel ») : seulement les médicaments non barrés
    if (start < 0 && /~~/.test(cells(l)[0] || "")) continue;
    const c = cells(l).map(clean);
    if (isTitle(c) || c[0] === "Nom") continue;
    c[0] = c[0].replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").trim(); // émoji de classe devant le médicament : pas copié
    if (c[0]) names.push(c[1] ? `${c[0]} : ${c[1]}` : c[0]);
  }
  return names.join("\n");
}

// Mode de vie : tel quel, puces gardées (sous-puces de l'Autonomie en retrait), sans gras.
// Intitulés non renseignés retirés ; un intitulé dont seules des sous-puces sont remplies (« Autonomie : ») est gardé
function modeDeVie(ls) {
  const items = [];
  for (const l of ls) {
    const m = l.match(/^(\s*)[-*+]\s+(.*)$/);
    if (!m) {
      if (l.trim()) items.push({ level: 0, text: clean(l), texte: true });
      continue;
    }
    const level = m[1].replace(/\t/g, "    ").length >= 2 ? 1 : 0;
    const text = clean(m[2]).replace(/^([^:]*:\s*)(.*)$/, (x, a, b) => a + lowerFirst(b)).trim();
    if (text && text !== "-") items.push({ level, text });
  }
  const vide = (t) => /:\s*$/.test(t);
  return items
    .filter((it, k) => {
      if (!vide(it.text)) return true;
      if (it.level) return false;
      // Intitulé vide : gardé seulement s'il a une sous-puce remplie
      for (let j = k + 1; j < items.length && items[j].level > 0; j++) if (!vide(items[j].text)) return true;
      return false;
    })
    .map((it) => (it.texte ? "" : it.level ? "  - " : "- ") + it.text)
    .join("\n");
}

// Un jour d'hospitalisation (puce principale à la ligne `start`) : ses sous-puces, une par ligne, sans gras.
// Sans sous-puce : le texte après la date.
function jour(lines, start) {
  const m = lines[start].match(/^[-*+]\s+(?:\[[ xX]\]\s+)?(.*)$/);
  const t = m ? m[1] : lines[start];
  const b = t.match(/^\*\*(.+?)\*\*\s*:?\s*(.*)$/);
  const i = t.indexOf(":");
  const head = clean(b ? b[2] : i >= 0 ? t.slice(i + 1) : "");
  const sub = [];
  for (let k = start + 1; k < lines.length; k++) {
    const l = lines[k];
    if (!l.trim()) continue;
    if (!/^\s/.test(l)) break; // puce principale suivante, titre ou texte non indenté
    const s = clean(l.replace(BULLET, ""));
    if (s) sub.push(s);
  }
  // majuscule au début, ligne vide avant chaque « Au niveau … » / « Sur le plan … »
  const parts = sub.length ? sub : [head].filter(Boolean);
  return upperFirst(parts.map((p, n) => (n && /^(au niveau|sur le plan)/i.test(p) ? "\n" + p : p)).join("\n"));
}

// Examen clinique d'entrée : même texte que le générateur « Observation classique » (Général → Neurologique)
function examenEntree(srcLines) {
  const h = srcLines.findIndex(l => /^#{1,6}\s/.test(l.trim()) && /Examen clinique d'entrée/i.test(l));
  if (h < 0) return "";
  let e = srcLines.findIndex((l, i) => i > h && /^#{1,5}\s/.test(l.trim()));
  if (e < 0) e = srcLines.length;
  const content = srcLines.join("\n");
  const allTasks = [];
  const fields = {};
  let sub = "";
  for (let i = h + 1; i < e; i++) {
    const l = srcLines[i];
    const hh = l.match(/^#{1,6}\s+(.*)$/);
    if (hh) sub = hh[1].trim();
    const m = l.match(/^\s*[-*]\s+\[([ xX])\]\s*(.*)$/);
    if (m) allTasks.push({ text: m[2], completed: m[1] !== " ", line: i, section: { subpath: sub } });
    const f = l.match(/^(\w+)::\s*(.*)$/);
    if (f) fields[f[1].toLowerCase()] = f[2].trim();
  }
  const page = { constantes: fields.constantes || null };

  function getField(name) {
    const lines = content.split("\n");
    const startRegex = new RegExp(`^${name}::[ \\t]*(.*)$`, "i");

    let found = false;
    let out = [];

    for (const raw of lines) {
      const line = raw.trim();

      if (!found) {
        const match = raw.match(startRegex);
        if (match) {
          found = true;
          if (match[1]?.trim()) out.push(match[1].trim());
        }
        continue;
      }

      if (
        line.startsWith("```") ||
        line === "---" ||
        /^#{1,6}\s+/.test(line) ||
        /^\*\*.+\*\*/.test(line) ||
        /^\s*[-*]\s+\[[ xX]\]/.test(raw) ||
        /^[A-Za-zÀ-ÿ0-9_-]+::?(?!\S*\/\/)/.test(line) && /^(atcd|allergies|traitements|histoiremaladie|constantes|poids|autres|conclusion)\s*:/i.test(line)
      ) {
        break;
      }

      out.push(raw);
    }

    return out.join("\n").trim();
  }

  function normKey(s) {
    return String(s || "")
      .toLocaleLowerCase("fr-FR")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[.\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function dedupLine(line) {
    const m = String(line).match(/^([^:]{1,40}) : (.*)$/);
    if (!m) return line;
    const seen = new Set();
    const items = m[2].split(/,\s+/).filter(x => {
      const k = normKey(x);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return `${m[1]} : ${items.join(", ")}`;
  }

  function sectionTasks(sectionName) {
    return allTasks.filter(t => String(t.section?.subpath || "") === sectionName);
  }

  function starts(tasks, label) {
    return tasks.find(t => String(t.text).trim().startsWith(label));
  }

  function exact(tasks, label) {
    return tasks.find(t => String(t.text).trim() === label);
  }

  function precision(task, field) {
    if (task?.[field]) return String(task[field]).trim();
    const nextLine = content.split("\n")[Number(task?.line) + 1] || "";
    return nextLine.replace(/^\s*-\s*Détail\s*:\s*/i, "").trim();
  }

  let lines = [];

  /* =========================
     ÉTAT GÉNÉRAL
  ========================= */

  (() => {
    const tasks = allTasks;
    const bon = starts(tasks, "Bon état général");
    const altere = starts(tasks, "Altération de l'état général");

    let out = [];

    if (bon?.completed) out.push("bon état général");

    if (altere?.completed) {
      const p = precision(altere, "precision_etat_general");
      out.push(p || "altération de l'état général");
    }

    if (out.length) lines.push("Général : " + out.join(", "));
  })();

  /* =========================
     CONSTANTES
  ========================= */

  (() => {
    const rawConst = page.constantes;
    const poidsTaille = getField("poids").trim();
    const commaCount = (poidsTaille.match(/,/g) || []).length;
    const lastCommaIndex = poidsTaille.lastIndexOf(",");
    const separatorIndex =
      commaCount >= 2 || /,\s+/.test(poidsTaille) || (commaCount === 1 && poidsTaille.includes("."))
        ? lastCommaIndex
        : -1;
    const poidsRaw =
      separatorIndex === -1
        ? poidsTaille
        : poidsTaille.slice(0, separatorIndex).trim();
    const tailleRaw =
      separatorIndex === -1
        ? ""
        : poidsTaille.slice(separatorIndex + 1).trim();
    const poids = poidsRaw
      .replace(/\s*kg\s*$/i, "")
      .trim();
    const taille = tailleRaw
      .replace(/\s*cm\s*$/i, "")
      .trim();

    const vals = rawConst
      ? String(rawConst).split(",").map(x => x.trim())
      : [];
    const [ta, fc, sat, temp] = vals;

    let out = [];

    if (ta && ta !== "0") out.push("TA " + ta + " mmHg");
    if (fc && fc !== "0") out.push("FC " + fc + "/min");
    if (sat && sat !== "0") out.push("Sat " + sat);
    if (temp && temp !== "0") out.push("T " + temp + " °C");
    if (poids && !/^0(?:[,.]0+)?$/.test(poids)) out.push("poids " + poids + " kg");
    if (taille && !/^0(?:[,.]0+)?$/.test(taille)) out.push("taille " + taille + " cm");

    if (out.length) lines.push("Constantes : " + out.join(", "));
  })();

  /* =========================
     AUSCULTATION CARDIAQUE
  ========================= */

  (() => {
    const tasks = sectionTasks("Auscultation cardiaque");

    const normal = starts(tasks, "Normal");
    const irregulier = starts(tasks, "Rythme irrégulier");
    const douleurThoracique = starts(tasks, "Douleur thoracique");
    const souffle = starts(tasks, "Souffle");
    const dyspnee = starts(tasks, "Dyspnée");
    const omi = starts(tasks, "OMI");

    const normalChecked = !!normal?.completed;
    const irregulierChecked = !!irregulier?.completed;
    const douleurThoraciqueChecked = !!douleurThoracique?.completed;
    const souffleChecked = !!souffle?.completed;
    const dyspneeChecked = !!dyspnee?.completed;
    const omiChecked = !!omi?.completed;

    const baseCardio =
      normalChecked ||
      irregulierChecked ||
      douleurThoraciqueChecked ||
      souffleChecked ||
      dyspneeChecked ||
      omiChecked;

    let out = [];

    if (!baseCardio) return;

    if (irregulierChecked) out.push("BDC irréguliers");
    else out.push("BDC réguliers");

    if (douleurThoraciqueChecked) {
      const p = precision(douleurThoracique, "precision_douleur_thoracique");
      out.push(p ? `douleur ${p}` : "douleur thoracique");
    } else {
      out.push("pas de douleur thoracique");
    }

    if (souffleChecked) {
      const p = precision(souffle, "precision_souffle");
      out.push(p ? "souffle " + p : "souffle");
    } else {
      out.push("sans souffle");
    }

    if (omiChecked) {
      const p = precision(omi, "precision_omi");
      out.push(p ? `OMI ${p}` : "OMI");
    } else {
      out.push("absence d'OMI");
    }

    if (dyspneeChecked) {
      const p = precision(dyspnee, "precision_dyspnee_cardio");
      out.push(p || "dyspnée");
    }

    lines.push("Cardio : " + out.join(", "));
  })();

  /* =========================
     RESPIRATOIRE
  ========================= */

  (() => {
    const tasksCardio = sectionTasks("Auscultation cardiaque");
    const tasks = sectionTasks("Examen respiratoire");

    const normal = starts(tasks, "Normal");
    const mvDiminue = starts(tasks, "Diminution du murmure vésiculaire");
    const crepitants = starts(tasks, "Râles crépitants");
    const sibilants = starts(tasks, "Sibilants");
    const dyspneeCardio = starts(tasksCardio, "Dyspnée");
    const dyspneeRespi = starts(tasks, "Dyspnée");
    const toux = starts(tasks, "Toux");

    const normalChecked = !!normal?.completed;
    const mvDiminueChecked = !!mvDiminue?.completed;
    const crepitantsChecked = !!crepitants?.completed;
    const sibilantsChecked = !!sibilants?.completed;
    const cardioDyspnee = !!dyspneeCardio?.completed;
    const respiDyspnee = !!dyspneeRespi?.completed;
    const touxChecked = !!toux?.completed;

    const baseRespi =
      normalChecked ||
      mvDiminueChecked ||
      crepitantsChecked ||
      sibilantsChecked ||
      cardioDyspnee ||
      respiDyspnee ||
      touxChecked;

    if (!baseRespi) return;

    let out = [];

    if (normalChecked && !mvDiminueChecked) {
      out.push("murmure vésiculaire normal");
    }

    if (mvDiminueChecked) {
      const p = precision(mvDiminue, "precision_mv");
      out.push(p ? `diminution du murmure vésiculaire ${p}` : "diminution du murmure vésiculaire");
    }

    if (crepitantsChecked) {
      const p = precision(crepitants, "precision_crepitants");
      out.push(p ? `râles crépitants ${p}` : "râles crépitants");
    }

    if (sibilantsChecked) {
      const p = precision(sibilants, "precision_sibilants");
      out.push(p ? `sibilants ${p}` : "sibilants");
    }

    if (!crepitantsChecked && !sibilantsChecked && (normalChecked || mvDiminueChecked)) {
      out.push("absence de bruits surajoutés");
    }

    if (touxChecked) {
      const p = precision(toux, "precision_toux");
      out.push(p ? `toux ${p}` : "toux");
    } else {
      out.push("absence de toux");
    }

    if (!cardioDyspnee && !respiDyspnee) {
      out.push("absence de dyspnée");
    } else {
      let vals = [];

      if (cardioDyspnee) {
        const p = precision(dyspneeCardio, "precision_dyspnee_cardio");
        vals.push(p || "dyspnée");
      }

      if (respiDyspnee) {
        const p = precision(dyspneeRespi, "precision_dyspnee_respi");
        const val = p || "dyspnée";
        if (!vals.includes(val)) vals.push(val);
      }

      out.push(vals.join(", "));
    }

    lines.push("Respiratoire : " + out.join(", "));
  })();

  /* =========================
     ABDOMEN
  ========================= */

  (() => {
    const tasks = sectionTasks("Abdomen");

    const normal = starts(tasks, "Normal");
    const souple = starts(tasks, "Souple");
    const sansDefense = starts(tasks, "Sans défense");
    const sansMasse = starts(tasks, "Sans masse palpée");

    const defense = starts(tasks, "Défense");
    const douleur = starts(tasks, "Douleur");
    const masse = starts(tasks, "Masse");
    const transit = starts(tasks, "Trouble du transit");

    const normalChecked = !!normal?.completed;
    const soupleChecked = !!souple?.completed;
    const sansDefenseChecked = !!sansDefense?.completed;
    const sansMasseChecked = !!sansMasse?.completed;

    const defenseChecked = !!defense?.completed;
    const douleurChecked = !!douleur?.completed;
    const masseChecked = !!masse?.completed;
    const transitChecked = !!transit?.completed;

    const anyAnomaly = douleurChecked || defenseChecked || masseChecked || transitChecked;

    if (!normalChecked && !anyAnomaly && !soupleChecked && !sansDefenseChecked && !sansMasseChecked) return;

    let out = [];

    if (normalChecked) {
      if (!douleurChecked) out.push("indolore");
      if (!transitChecked) out.push("pas de trouble du transit");
    }

    if (soupleChecked && !defenseChecked) out.unshift("abdomen souple");
    if (sansDefenseChecked && !defenseChecked) out.push("absence de défense");
    if (sansMasseChecked && !masseChecked) out.push("absence de masse palpée");

    if (douleurChecked) {
      const p = precision(douleur, "precision_douleur_abdo");
      out.push(p || "douleur abdominale");
    }

    if (defenseChecked) out.push("défense");

    if (masseChecked) {
      const p = precision(masse, "precision_masse_abdo");
      out.push(p || "masse abdominale");
    }

    if (transitChecked) {
      const p = precision(transit, "precision_transit");
      out.push(p || "trouble du transit");
    }

    if (!normalChecked && anyAnomaly) {
      if (!douleurChecked) out.push("indolore");
      if (!defenseChecked && !sansDefenseChecked) out.push("absence de défense");
      if (!masseChecked && !sansMasseChecked) out.push("absence de masse palpée");
      if (!transitChecked) out.push("pas de trouble du transit");
      if (!soupleChecked && !defenseChecked) out.unshift("abdomen souple");
    }

    if (defenseChecked) {
      out = out.filter(x => x !== "abdomen souple" && x !== "absence de défense");
    }

    out = [...new Set(out)];

    if (out.length) lines.push("Abdomen : " + out.join(", "));
  })();

  /* =========================
     URINAIRE
  ========================= */

  (() => {
    const tasks = sectionTasks("Urinaire");

    const normal = starts(tasks, "Normal");
    const sfu = starts(tasks, "Signes fonctionnels urinaires");
    const dfl = starts(tasks, "Douleur fosse lombaire");

    const normalChecked = !!normal?.completed;
    const sfuChecked = !!sfu?.completed;
    const dflChecked = !!dfl?.completed;

    if (!normalChecked && !sfuChecked && !dflChecked) return;

    if (normalChecked) {
      lines.push("Urinaire : absence de signes fonctionnels urinaires, absence de douleur en fosse lombaire");
      return;
    }

    let out = [];

    if (sfuChecked) {
      const p = precision(sfu, "precision_sfu");
      out.push(p || "signes fonctionnels urinaires");
    } else {
      out.push("absence de signes fonctionnels urinaires");
    }

    if (dflChecked) {
      const p = precision(dfl, "precision_dfl");
      out.push(p ? `douleur fosse lombaire ${p}` : "douleur fosse lombaire");
    } else {
      out.push("absence de douleur en fosse lombaire");
    }

    lines.push("Urinaire : " + out.join(", "));
  })();

  /* =========================
     ORL
  ========================= */

  (() => {
    const tasks = sectionTasks("ORL");

    const normal = starts(tasks, "Normal");
    const thyroNormale = starts(tasks, "Thyroïde normale");
    const conjNormales = starts(tasks, "Conjonctives normales");
    const tympansNormaux = starts(tasks, "Tympans normaux");

    const rhinite = starts(tasks, "Rhinite");
    const sinus = starts(tasks, "Douleurs sinusiennes");
    const adp = starts(tasks, "Adénopathies cervicales");
    const thyroide = starts(tasks, "Anomalie thyroïdienne");
    const oculaire = starts(tasks, "Oculaire");
    const buccal = starts(tasks, "Buccal");
    const oreilles = starts(tasks, "Oreilles");

    const normalChecked = !!normal?.completed;
    const rhiniteChecked = !!rhinite?.completed;
    const sinusChecked = !!sinus?.completed;
    const adpChecked = !!adp?.completed;
    const thyroChecked = !!thyroide?.completed;
    const oculaireChecked = !!oculaire?.completed;
    const buccalChecked = !!buccal?.completed;
    const oreillesChecked = !!oreilles?.completed;

    const anyAnomaly =
      rhiniteChecked ||
      sinusChecked ||
      adpChecked ||
      thyroChecked ||
      oculaireChecked ||
      buccalChecked ||
      oreillesChecked;

    if (!normalChecked && !anyAnomaly && !thyroNormale?.completed && !conjNormales?.completed && !tympansNormaux?.completed) return;

    let out = [];

    if (rhiniteChecked) {
      const p = precision(rhinite, "precision_rhinite");
      out.push(p ? `rhinite ${p}` : "rhinite");
    }

    if (sinusChecked) {
      const p = precision(sinus, "precision_sinus");
      out.push(p ? `douleur sinus ${p}` : "douleur sinusienne");
    }

    if (adpChecked) {
      const p = precision(adp, "precision_adp_cervicales");
      out.push(p || "adénopathies cervicales");
    }

    if (thyroChecked) {
      const p = precision(thyroide, "precision_thyroide");
      out.push(p || "anomalie thyroïdienne");
    }

    if (oculaireChecked) {
      const p = precision(oculaire, "precision_oculaire");
      out.push(p || "anomalie oculaire");
    }

    if (buccalChecked) {
      const p = precision(buccal, "precision_buccal");
      out.push(p || "anomalie buccale");
    }

    if (oreillesChecked) {
      const p = precision(oreilles, "precision_oreilles");
      out.push(p || "anomalie des oreilles");
    }

    if (normalChecked || anyAnomaly) {
      if (!rhiniteChecked) out.push("pas de rhinite");
      if (!sinusChecked) out.push("pas de douleurs sinusiennes");
      if (!adpChecked) out.push("pas d'adénopathies cervicales");
      if (!buccalChecked) out.push("examen buccal normal");
    }

    if (thyroNormale?.completed && !thyroChecked) {
      out.push("pas d'anomalie à la palpation thyroïdienne");
    }

    if (conjNormales?.completed && !oculaireChecked) {
      out.push("conjonctives normales");
    }

    if (tympansNormaux?.completed && !oreillesChecked) {
      out.push("tympans normaux");
    }

    out = [...new Set(out)];

    if (out.length) lines.push("ORL : " + out.join(", "));
  })();

  /* =========================
     NEUROLOGIQUE
  ========================= */

  (() => {
    const tasks = sectionTasks("Neurologique");

    const normal = exact(tasks, "Normal");

    const pcNormales = exact(tasks, "Paires crâniennes intactes");
    const pupillesNormales = exact(tasks, "Pupilles normales");
    const cutaneNormal = exact(tasks, "Examen cutané normal");

    const conscience = starts(tasks, "Conscience");
    const pc = starts(tasks, "Paires crâniennes");
    const raideur = exact(tasks, "Raideur nucale");
    const cephalees = starts(tasks, "Céphalées");
    const nausees = exact(tasks, "Nausées");
    const vomissements = exact(tasks, "Vomissements");
    const pupilles = starts(tasks, "Pupilles");
    const cutane = starts(tasks, "Examen cutané");
    const deficit = starts(tasks, "Déficit sensitivo-moteur");

    const normalChecked = !!normal?.completed;

    const conscienceChecked = !!conscience?.completed;
    const pcChecked = !!pc?.completed && String(pc.text).trim() !== "Paires crâniennes intactes";
    const raideurChecked = !!raideur?.completed;
    const cephaleesChecked = !!cephalees?.completed;
    const nauseesChecked = !!nausees?.completed;
    const vomissementsChecked = !!vomissements?.completed;
    const pupillesChecked = !!pupilles?.completed && String(pupilles.text).trim() !== "Pupilles normales";
    const cutaneChecked = !!cutane?.completed && String(cutane.text).trim() !== "Examen cutané normal";
    const deficitChecked = !!deficit?.completed;

    let out = [];

    if (conscienceChecked) {
      const p = precision(conscience, "precision_conscience");
      out.push(p || "trouble de conscience");
    }

    if (pcChecked) {
      const p = precision(pc, "precision_pc");
      out.push(p || "anomalie des paires crâniennes");
    }

    if (raideurChecked) out.push("raideur nucale");

    if (cephaleesChecked) {
      const p = precision(cephalees, "precision_cephalees");
      out.push(p ? `céphalée ${p}` : "céphalées");
    }

    if (nauseesChecked && vomissementsChecked) {
      out.push("nausées et vomissements");
    } else if (nauseesChecked) {
      out.push("nausées sans vomissements");
    } else if (vomissementsChecked) {
      out.push("vomissements");
    }

    if (pupillesChecked) {
      const p = precision(pupilles, "precision_pupilles");
      out.push(p || "anomalie pupillaire");
    }

    if (cutaneChecked) {
      const p = precision(cutane, "precision_cutane");
      out.push(p || "anomalie cutanée");
    }

    if (deficitChecked) {
      const p = precision(deficit, "precision_deficit");
      out.push(p || "déficit neurologique");
    }

    const anyAnomaly = out.length > 0;

    if (!normalChecked && !anyAnomaly && !pcNormales?.completed && !pupillesNormales?.completed && !cutaneNormal?.completed) return;

    if (normalChecked || anyAnomaly) {
      if (!conscienceChecked) out.push("conscience normale");
      if (!cephaleesChecked) out.push("absence de céphalées");
      if (!nauseesChecked && !vomissementsChecked) out.push("absence de nausées ou de vomissements");
    }

    if (pcNormales?.completed && !pcChecked) out.push("paires crâniennes intactes");
    if (pupillesNormales?.completed && !pupillesChecked) out.push("pupilles normales");
    if (cutaneNormal?.completed && !cutaneChecked) out.push("examen cutané normal");

    out = [...new Set(out)];

    if (out.length) lines.push("Neurologique : " + out.join(", "));
  })();

  return lines.map(dedupLine).join("\n").trim();
}

// ---------- Examen clinique d'entrée : Valider (texte à copier) / Retour (cases à cocher) ----------
// Valider remplace les cases par le texte généré ; la version à cocher reste dans la note, dans un encadré replié
// sous le texte, que Retour remet en place. Rien n'est gardé hors de la note : le retour marche sur tous les PC.

// Encadré caché à l'affichage (voir copier.css) : on ne voit que le texte validé et le bouton Retour
const ENCADRE = "> [!examen-a-cocher]- Examen à cocher";
// L'ancien encadré [!abstract] (premières notes validées) est reconnu aussi
const isEncadre = (l) => /^>\s*\[!(examen-a-cocher|abstract)\][-+]?\s*Examen à cocher\s*$/.test(l.trim());

// Bornes de la section : du titre jusqu'au titre suivant de niveau 1 à 5 (les ###### sont des sous-parties de l'examen)
function bornesExamen(ls) {
  const h = ls.findIndex((l) => /^#{1,6}\s/.test(l.trim()) && /Examen clinique d'entrée/i.test(l));
  if (h < 0) return null;
  let e = ls.findIndex((l, i) => i > h && /^#{1,5}\s/.test(l.trim()));
  if (e < 0) e = ls.length;
  return { h, e };
}

// État de la section : « valide » si l'encadré de la version à cocher est là
function etatExamen(ls) {
  const b = bornesExamen(ls);
  if (!b) return null;
  return ls.slice(b.h + 1, b.e).some(isEncadre) ? "valide" : "a-cocher";
}

// Texte validé (au-dessus de l'encadré), pour le bouton Copier une fois l'examen validé
function texteValide(ls) {
  const b = bornesExamen(ls);
  if (!b) return "";
  const out = [];
  for (let i = b.h + 1; i < b.e && !isEncadre(ls[i]); i++) if (ls[i].trim()) out.push(ls[i].trim());
  return out.join("\n");
}

// Nouveau texte de la note, ou une chaîne d'erreur précédée de « ! »
function validerExamen(text) {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const ls = text.split(/\r?\n/);
  const b = bornesExamen(ls);
  if (!b) return "!Titre « Examen clinique d'entrée » introuvable";
  if (etatExamen(ls) === "valide") return "!Examen déjà validé";
  const genere = examenEntree(ls);
  if (!genere) return "!Rien de coché dans l'examen clinique d'entrée";
  const section = ls.slice(b.h + 1, b.e);
  while (section.length && !section[section.length - 1].trim()) section.pop();
  while (section.length && !section[0].trim()) section.shift();
  const encadre = [ENCADRE, ...section.map((l) => (l ? "> " + l : ">"))];
  ls.splice(b.h + 1, b.e - b.h - 1, "", ...genere.split("\n"), "", ...encadre, "");
  return ls.join(nl);
}

function retourExamen(text, force = false) {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const ls = text.split(/\r?\n/);
  const b = bornesExamen(ls);
  if (!b) return "!Titre « Examen clinique d'entrée » introuvable";
  const d = ls.findIndex((l, i) => i > b.h && i < b.e && isEncadre(l));
  if (d < 0) return "!Pas de version à cocher dans la note";
  const orig = [];
  let f = d + 1;
  for (; f < b.e && /^>/.test(ls[f]); f++) orig.push(ls[f].replace(/^> ?/, ""));
  // Texte validé qui ne correspond plus aux cases (corrigé à la main) : on demande avant de l'effacer (« ? » = question)
  const norm = (arr) => arr.map((l) => l.trim()).filter(Boolean).join("\n");
  const genere = examenEntree([ls[b.h], ...orig]);
  if (!force && norm(ls.slice(b.h + 1, d)) !== norm(genere.split("\n")))
    return "?Le texte validé ne correspond plus aux cases cochées (corrigé à la main ?).\n\nRevenir quand même aux cases à cocher ? Le texte validé sera remplacé.";
  // Ce qui a été écrit sous l'encadré est gardé, après les cases
  const suite = ls.slice(f, b.e);
  while (suite.length && !suite[0].trim()) suite.shift();
  while (suite.length && !suite[suite.length - 1].trim()) suite.pop();
  ls.splice(b.h + 1, b.e - b.h - 1, "", ...orig, "", ...(suite.length ? [...suite, ""] : []));
  return ls.join(nl);
}

const KINDS = [
  { re: /Antécédents/i, build: antecedents },
  { re: /Mode de vie/i, build: modeDeVie },
  { re: /HDM|Histoire de la maladie/i, build: histoire },
  { re: /Traitement/i, build: traitementHabituel },
  { re: /Examen clinique d'entrée/i, build: (ls) => (etatExamen(ls) === "valide" ? texteValide(ls) : examenEntree(ls)), wholeNote: true, examen: true },
];

// ---------- Plugin ----------

module.exports = class CopyButtonsPlugin extends Plugin {
  onload() {
    // Mode modification (pas de bouton sur les titres) : mêmes actions par la palette de commandes
    this.addCommand({
      id: "valider-examen-entree",
      name: "Valider l'examen clinique d'entrée (texte à copier)",
      checkCallback: (checking) => this.commandeExamen(checking, validerExamen),
    });
    this.addCommand({
      id: "retour-examen-entree",
      name: "Revenir à l'examen clinique d'entrée à cocher",
      checkCallback: (checking) => this.commandeExamen(checking, retourExamen),
    });

    this.registerMarkdownPostProcessor((el, ctx) => {
      const info = ctx.getSectionInfo(el);
      if (!info) return;
      const lines = info.text.split(/\r?\n/);

      // Titres
      const h = el.querySelector("h1, h2, h3, h4, h5, h6");
      if (h) {
        const line = lines[info.lineStart] || "";
        const kind = KINDS.find((k) => HEADING.test(line.trim()) && k.re.test(line));
        if (kind) {
          this.addButton(h, h.firstChild, ctx.sourcePath, (ls) => {
            const idx = findLine(ls, line, info.lineStart);
            return idx < 0 ? "" : kind.wholeNote ? kind.build(ls) : kind.build(sectionAt(ls, idx));
          });
          if (kind.examen) this.addValiderButton(h, ctx.sourcePath, etatExamen(lines));
        }
      }

      // Jours d'hospitalisation : puces principales d'une liste située sous le titre Hospitalisation
      const ul = el.querySelector(":scope > ul, :scope > ol");
      if (!ul) return;
      let headingLine = "";
      for (let i = Math.min(info.lineStart, lines.length - 1); i >= 0; i--) {
        if (HEADING.test((lines[i] || "").trim())) {
          headingLine = lines[i];
          break;
        }
      }
      if (!/Hospitalisation/i.test(headingLine)) return;

      const topLines = [];
      for (let i = info.lineStart; i <= info.lineEnd; i++) {
        if (/^[-*+]\s/.test(lines[i])) topLines.push(i);
      }
      const items = Array.from(ul.children).filter((c) => c.tagName === "LI");
      items.forEach((li, n) => {
        const lineNo = topLines[n];
        if (lineNo === undefined) return;
        const original = lines[lineNo];
        // En premier dans la puce : l icône flotte à droite de sa première ligne
        this.addButton(li, li.firstChild, ctx.sourcePath, (ls) => {
          const idx = findLine(ls, original, lineNo);
          return idx < 0 ? "" : jour(ls, idx);
        });
      });
    });
  }

  commandeExamen(checking, fn) {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || !view.file) return false;
    if (!checking) this.modifierNote(view.file.path, fn);
    return true;
  }

  // Bouton Valider (cases → texte) ou Retour (texte → cases) à côté du bouton Copier du titre
  addValiderButton(h, sourcePath, etat) {
    if (!etat || h.querySelector(":scope > .examen-valider-btn")) return;
    const btn = createEl("button", { cls: "copy-buttons-btn examen-valider-btn clickable-icon", attr: { type: "button" } });
    const montrer = (valide) => {
      setIcon(btn, valide ? "undo-2" : "check-check");
      btn.setAttr("aria-label", valide ? "Retour : remettre les cases à cocher" : "Valider : remplacer les cases par le texte à copier");
    };
    montrer(etat === "valide");
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // État lu au moment du clic, sur le texte même qui sera modifié : le titre n'est pas toujours redessiné après coup
      let valide = false;
      const basculer = (t, force) => {
        valide = etatExamen(t.split(/\r?\n/)) === "valide";
        return valide ? retourExamen(t, force) : validerExamen(t);
      };
      if (await this.modifierNote(sourcePath, basculer)) montrer(!valide);
    });
    h.insertBefore(btn, h.firstChild);
  }

  // Applique fn (texte, force → texte, « !erreur » ou « ?question ») à la note : par l'éditeur en mode modification
  // (Ctrl+Z possible), sinon par le fichier. Une question est posée à l'utilisateur ; sur oui, fn est rappelée avec force
  async modifierNote(path, fn) {
    const appliquer = (t) => {
      const r = fn(t, false);
      if (!r.startsWith("?")) return r;
      return window.confirm(r.slice(1)) ? fn(t, true) : "!";
    };
    const view = this.app.workspace.getLeavesOfType("markdown").map((l) => l.view)
      .find((v) => v instanceof MarkdownView && v.file && v.file.path === path && v.getMode() === "source");
    if (view && view.editor) {
      const old = view.editor.getValue();
      const neu = appliquer(old);
      if (neu.startsWith("!")) {
        if (neu.length > 1) new Notice(neu.slice(1));
        return false;
      }
      const cm = view.editor.cm;
      if (cm && cm.dispatch) {
        let a = 0;
        while (a < old.length && old[a] === neu[a]) a++;
        let b = 0;
        while (b < old.length - a && b < neu.length - a && old[old.length - 1 - b] === neu[neu.length - 1 - b]) b++;
        const top = cm.scrollDOM.scrollTop;
        cm.dispatch({ changes: { from: a, to: old.length - b, insert: neu.slice(a, neu.length - b) }, scrollIntoView: false });
        requestAnimationFrame(() => (cm.scrollDOM.scrollTop = top));
      } else view.editor.setValue(neu);
      return true;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return false;
    let echec = false, msg = "";
    await this.app.vault.process(file, (t) => {
      const r = appliquer(t);
      if (r.startsWith("!")) {
        echec = true;
        msg = r.slice(1);
        return t;
      }
      return r;
    });
    if (msg) new Notice(msg);
    return !echec;
  }

  addButton(parent, before, sourcePath, build) {
    const btn = createEl("button", { cls: "copy-buttons-btn clickable-icon", attr: { "aria-label": "Copier", type: "button" } });
    setIcon(btn, "copy");
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Relire la note au clic : le texte copié est toujours celui du moment
      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(file instanceof TFile)) return;
      // Pastilles d'importance (« - [!] », « 🔴 ») retirées : elles ne vont pas dans le texte copié
      const ls = (await this.app.vault.read(file)).split(/\r?\n/)
        .map((l) => l.replace(/^(\s*(?:>\s*)*[-*+]\s+)\[!\]\s+/, "$1").replace(/\s*🔴/g, "").replace(/<span class="pastille"><\/span>\s*/g, ""));
      const text = build(ls);
      if (!text) {
        new Notice("Rien à copier");
        return;
      }
      await copy(text);
      flash(btn);
    });
    if (before) parent.insertBefore(btn, before);
    else parent.appendChild(btn);
  }
};

// La ligne a pu bouger depuis l'affichage : la reprendre au même endroit, sinon la chercher
function findLine(ls, original, hint) {
  if (ls[hint] === original) return hint;
  let best = -1;
  ls.forEach((l, i) => {
    if (l === original && (best < 0 || Math.abs(i - hint) < Math.abs(best - hint))) best = i;
  });
  return best;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

// Icône coche pendant 1,5 s après la copie
function flash(btn) {
  setIcon(btn, "check");
  btn.addClass("is-copied");
  setTimeout(() => {
    setIcon(btn, "copy");
    btn.removeClass("is-copied");
  }, 1500);
}

module.exports._test = { validerExamen, retourExamen, texteValide, etatExamen, antecedents, traitementHabituel, modeDeVie, jour, sectionAt, examenEntree, histoire };

  return module.exports;
})();

// ===== Examens complémentaires : émoji de catégorie, bouton + et colonne Examen (src/examens.js) =====
const module_examens = (function () {
  const module = { exports: {} };
const { MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, SuggestModal } = require("obsidian");

const EXAM_BUTTON_PATTERN =
  /<button class="exam-emoji-inline-picker" data-exam-emoji-picker>(.*?)<\/button>/;
const EXAM_BUTTON_PATTERN_GLOBAL =
  /<button class="exam-emoji-inline-picker" data-exam-emoji-picker>(.*?)<\/button>/g;
const EXAM_BUTTON_HTML =
  '<button class="exam-emoji-inline-picker" data-exam-emoji-picker></button>';

const EXAM_EMOJIS = [
  ["🧪", "Biochimie"],
  ["🔊", "Échographie"],
  ["☣️", "Microbiologie"],
  ["🫙", "Prélèvement"],
  ["📡", "Imagerie"],
  ["🧲", "IRM"],
  ["🩻", "Radiographie"],
  ["🫀", "Cardiologie"],
  ["🩸", "Hématologie"],
  ["🧂", "Ionogramme"],
];

// Examens proposés par le bouton +, selon l'émoji de la ligne (modifiables dans les réglages du plugin).
// L'unité entre parenthèses seulement quand elle est précisée dans les notes ; la valeur se tape seule dans la case du jour
const DEFAULT_EXAMS = {
  Biochimie: [
    "CRP", "PCT", "Albumine", "Protéines", "BNP (ng/L)", "NT-proBNP", "Troponine", "Ferritine", "Fer (mg/L)", "CST (%)",
    "Transferrine", "B12 (pmol/L)", "B9 (ng/ml)", "TSH", "ASAT", "ALAT", "GGT", "PAL", "Bilirubine", "Lipase", "LDH", "CPK",
    "Haptoglobine", "Glycémie", "HbA1c", "Calcium", "Phosphore", "Urée", "Acide urique", "Vitamine D", "EPS", "PSA",
    "IgG (g/L)", "IgA", "IgM", "CLL K (mg/L)", "CLL L (mg/L)",
  ],
  Ionogramme: ["Na", "K", "Créatinine", "DFG", "Urée", "Mg", "Calcium", "Phosphore", "Chlore", "Bicarbonates"],
  Hématologie: [
    "Hb", "GB", "PNN", "Lymphocytes", "Monocytes", "Éosinophiles", "Plaquettes", "VGM", "Réticulocytes",
    "TP", "TCA", "Fibrinogène", "D-dimères", "Frottis",
  ],
  Microbiologie: ["Hémocultures", "ECBU", "PCR Grippe/Covid/VRS", "Antigénuries", "Coproculture", "Sérologies"],
  Prélèvement: ["BU", "ECBU", "Protéinurie", "Créatininurie", "Prot/créat", "Ponction lombaire", "Ponction pleurale"],
  Imagerie: ["Scanner thoracique", "Scanner abdomino-pelvien", "Angioscanner", "Scanner cérébral", "TEP-scanner"],
  IRM: ["IRM cérébrale", "IRM médullaire", "IRM abdominale"],
  Radiographie: ["Radiographie thoracique", "ASP"],
  Cardiologie: ["ECG", "ETT", "Holter ECG", "MAPA"],
  Échographie: ["ETT", "Échographie abdominale", "Échographie rénale", "Écho-doppler veineux", "Écho-doppler artériel", "Échographie pleurale"],
};

const stripVariation = (s) => (s || "").replace(/️/g, "").trim();
const labelOfEmoji = (emoji) => {
  const found = EXAM_EMOJIS.find(([e]) => stripVariation(e) === stripVariation(emoji));
  return found ? found[1] : null;
};
const normalize = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

class ExamEmojiModal extends Modal {
  constructor(app, onSelect) {
    super(app);
    this.onSelect = onSelect;
  }

  onOpen() {
    this.setTitle("Choisir un type d’examen");
    this.modalEl.addClass("exam-emoji-modal");

    const grid = this.contentEl.createDiv({ cls: "exam-emoji-grid" });

    EXAM_EMOJIS.forEach(([emoji, label], index) => {
      const button = grid.createEl("button", {
        cls: "exam-emoji-button",
        attr: {
          type: "button",
          "aria-label": label,
          title: `${(index + 1) % 10} — ${label}`,
        },
      });
      button.createSpan({ cls: "exam-emoji-symbol", text: emoji });
      button.createSpan({ cls: "exam-emoji-label", text: label });
      button.addEventListener("click", () => this.insertEmoji(emoji));
    });

    this.scope.register([], "1", () => this.insertEmoji(EXAM_EMOJIS[0][0]));
    this.scope.register([], "2", () => this.insertEmoji(EXAM_EMOJIS[1][0]));
    this.scope.register([], "3", () => this.insertEmoji(EXAM_EMOJIS[2][0]));
    this.scope.register([], "4", () => this.insertEmoji(EXAM_EMOJIS[3][0]));
    this.scope.register([], "5", () => this.insertEmoji(EXAM_EMOJIS[4][0]));
    this.scope.register([], "6", () => this.insertEmoji(EXAM_EMOJIS[5][0]));
    this.scope.register([], "7", () => this.insertEmoji(EXAM_EMOJIS[6][0]));
    this.scope.register([], "8", () => this.insertEmoji(EXAM_EMOJIS[7][0]));
    this.scope.register([], "9", () => this.insertEmoji(EXAM_EMOJIS[8][0]));
    this.scope.register([], "0", () => this.insertEmoji(EXAM_EMOJIS[9][0]));
  }

  insertEmoji(emoji) {
    this.onSelect(emoji);
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

// Liste des examens à ajouter : on tape pour filtrer, Entrée sur un texte absent de la liste l'ajoute tel quel
class ExamNameModal extends SuggestModal {
  constructor(app, names, title, onChoose) {
    super(app);
    this.names = names;
    this.onChoose = onChoose;
    this.setPlaceholder(`${title} : examen à ajouter (Entrée sur un texte libre pour l’ajouter tel quel)`);
  }

  getSuggestions(query) {
    const q = normalize(query.trim());
    const list = this.names.filter((name) => normalize(name).includes(q));
    if (q && !this.names.some((name) => normalize(name) === q)) list.push({ free: query.trim() });
    return list;
  }

  renderSuggestion(item, el) {
    el.setText(typeof item === "string" ? item : `Ajouter « ${item.free} »`);
  }

  onChooseSuggestion(item) {
    this.onChoose(typeof item === "string" ? item : item.free);
  }
}

class ExamSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("p", {
      text: "Examens proposés par le bouton + selon l’émoji de la ligne, un par ligne. L’examen choisi s’ajoute dans la colonne Examen (créée au premier ajout), sur une nouvelle ligne de la catégorie.",
    });
    for (const [emoji, label] of EXAM_EMOJIS) {
      new Setting(containerEl).setName(`${emoji} ${label}`).addTextArea((area) => {
        area.setValue(this.plugin.examsFor(label).join("\n"));
        area.inputEl.rows = 6;
        area.inputEl.style.width = "100%";
        area.onChange(async (value) => {
          this.plugin.settings.exams[label] = value.split("\n").map((s) => s.trim()).filter(Boolean);
          await this.plugin.saveData(this.plugin.settings);
        });
      });
    }
  }
}

// Remplace seulement la partie qui change : setValue réécrit toute la note
// et ramène l'écran en haut à chaque frappe dans un tableau.
function replaceKeepingView(editor, source, updated) {
  let start = 0;
  while (start < source.length && start < updated.length && source[start] === updated[start]) start++;
  let endOld = source.length, endNew = updated.length;
  while (endOld > start && endNew > start && source[endOld - 1] === updated[endNew - 1]) { endOld--; endNew--; }
  const insert = updated.slice(start, endNew);
  const cm = editor.cm;
  if (cm) {
    const top = cm.scrollDOM.scrollTop;
    cm.dispatch({ changes: { from: start, to: endOld, insert }, scrollIntoView: false });
    requestAnimationFrame(() => {
      if (cm.scrollDOM.scrollTop !== top) cm.scrollDOM.scrollTop = top;
    });
    return;
  }
  const scroll = editor.getScrollInfo();
  editor.replaceRange(insert, editor.offsetToPos(start), editor.offsetToPos(endOld));
  editor.scrollTo(scroll.left, scroll.top);
}

module.exports = class ExamEmojiPickerPlugin extends Plugin {
  async onload() {
    this.settings = Object.assign({ exams: {} }, await this.loadData());
    this.addSettingTab(new ExamSettingTab(this.app, this));
    this.setupAddButtons();

    this.registerEvent(
      this.app.workspace.on("editor-change", (editor, markdownView) => {
        if (!markdownView) return;

        const source = editor.getValue();
        const updated = addPickersToExamRows(source);
        if (updated === source) return;

        replaceKeepingView(editor, source, updated);
      })
    );

    this.registerDomEvent(document, "click", (event) => {
      const button = event.target.closest?.(
        "button.exam-emoji-inline-picker[data-exam-emoji-picker]"
      );
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      const view = this.app.workspace
        .getLeavesOfType("markdown")
        .map((leaf) => leaf.view)
        .find(
          (candidate) =>
            candidate instanceof MarkdownView && candidate.containerEl.contains(button)
        ) || this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) {
        new Notice("Ouvrez la note en mode lecture ou aperçu.");
        return;
      }

      // Compter seulement dans la vue visible (lecture ou édition) : l'autre vue, cachée, contient aussi des boutons
      const scope =
        button.closest(".markdown-reading-view, .markdown-preview-view, .markdown-source-view") || view.containerEl;
      const targetIndex = Array.from(
        scope.querySelectorAll(
          "button.exam-emoji-inline-picker[data-exam-emoji-picker]"
        )
      ).indexOf(button);
      if (targetIndex < 0) {
        new Notice("Le bouton d’examen est introuvable dans cette vue.");
        return;
      }

      new ExamEmojiModal(this.app, async (emoji) => {
        const introuvable = () => new Notice("Le bouton d’examen est introuvable dans cette note.");
        // Mode lecture : par le fichier. L'éditeur caché du mode lecture garde l'ancien texte après une modification
        // venue d'ailleurs (Sync, pastille) et n'enregistre pas ce qu'on y écrit
        if (view.getMode() !== "source") {
          let ok = false;
          await this.app.vault.process(view.file, (text) => {
            ok = targetIndex < (text.match(EXAM_BUTTON_PATTERN_GLOBAL) || []).length;
            return ok ? replaceExamButtonAt(text, targetIndex, emoji) : text;
          });
          if (!ok) introuvable();
          return;
        }
        const source = view.editor.getValue();
        const updated = replaceExamButtonAt(source, targetIndex, emoji);
        if (updated === source) return void introuvable();

        replaceKeepingView(view.editor, source, updated);
      }).open();
    });

    this.addCommand({
      id: "open-exam-emoji-picker",
      name: "Choisir un émoji d’examen",
      editorCallback: (editor) => {
        new ExamEmojiModal(this.app, (emoji) => {
          editor.replaceSelection(emoji);
          editor.focus();
        }).open();
      },
    });
  }

  onunload() {
    document.querySelectorAll(".exam-add-button").forEach((b) => b.remove());
  }

  examsFor(label) {
    if (label && this.settings.exams[label]) return this.settings.exams[label];
    if (label) return DEFAULT_EXAMS[label] || [];
    // Ligne sans émoji : tous les examens, sans doublon
    return [...new Set(EXAM_EMOJIS.flatMap(([, l]) => this.examsFor(l)))];
  }

  // ---------- Bouton + : ajoute un nom d'examen dans la deuxième colonne de la ligne ----------

  setupAddButtons() {
    // Le + n'est pas écrit dans la note : il est ajouté à l'affichage, à côté de chaque bouton émoji
    // Mode lecture : on garde le bloc affiché pour retrouver plus tard sa position dans la note
    this.sectionOf = new WeakMap();
    const attach = (root, section) => {
      for (const picker of root.querySelectorAll("button.exam-emoji-inline-picker[data-exam-emoji-picker]")) {
        const next = picker.nextElementSibling;
        if (next && next.classList.contains("exam-add-button")) continue;
        const add = createEl("button", {
          cls: "exam-add-button",
          text: "+",
          attr: { type: "button", "aria-label": "Ajouter un examen", title: "Ajouter un examen" },
        });
        picker.after(add);
        if (section) this.sectionOf.set(add, section);
      }
    };
    this.registerMarkdownPostProcessor((el, ctx) => attach(el, { el, ctx }));
    // Tableaux déjà affichés quand le plugin se charge (activation, mise à jour) : ils ne repassent pas par le post-traitement
    this.app.workspace.onLayoutReady(() => attach(document.body, null));

    // Le tableau de l'aperçu en direct capte les clics pour éditer la case : on les arrête dès la fenêtre
    const intercept = (event) => {
      const add = event.target instanceof Element && event.target.closest("button.exam-add-button");
      if (!add) return;
      event.stopImmediatePropagation();
      if (event.type !== "touchstart") event.preventDefault();
      if (event.type === "click") this.onAddClick(add);
    };
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "touchstart"]) {
      this.registerDomEvent(window, type, intercept, { capture: true });
    }
  }

  onAddClick(add) {
    const picker = add.previousElementSibling;
    const emoji = picker ? picker.textContent : "";
    const label = labelOfEmoji(emoji);
    const target = this.locateRow(add, picker);
    if (!target) {
      new Notice("Ligne d’examen introuvable dans la note.");
      return;
    }
    const title = label ? `${stripVariation(emoji)} ${label}` : "Tous les examens";
    new ExamNameModal(this.app, this.examsFor(label), title, (name) => this.insertExam(target, name)).open();
  }

  // Ligne de la note qui correspond au bouton cliqué
  locateRow(add, picker) {
    const views = this.app.workspace.getLeavesOfType("markdown").map((leaf) => leaf.view);
    const view = views.find((v) => v instanceof MarkdownView && v.containerEl.contains(add));
    if (!view || !view.file) return null;
    const lines = view.editor.getValue().split("\n");
    // Contrôle : la ligne trouvée porte bien le même émoji que le bouton cliqué
    const isExamRow = (n) => {
      if (n < 0 || n >= lines.length) return false;
      const found = lines[n].match(EXAM_BUTTON_PATTERN);
      return !!found && stripVariation(found[1]) === stripVariation(picker ? picker.textContent : "");
    };

    // Aperçu en direct : position du tableau dans l'éditeur, puis numéro de la ligne dans le tableau
    const widget = add.closest(".cm-table-widget");
    const cm = view.editor.cm;
    const row = add.closest("tr");
    if (widget && cm && row) {
      try {
        const start = cm.state.doc.lineAt(cm.posAtDOM(widget)).number - 1;
        const line = row.rowIndex === 0 ? start : start + 1 + row.rowIndex;
        if (isExamRow(line)) return { view, line, live: true };
      } catch (e) {
        // on passe à la méthode suivante
      }
    }

    // Mode lecture : position du bloc affiché dans la note, puis numéro de la ligne dans le tableau
    const section = this.sectionOf.get(add);
    const info = section && section.ctx.getSectionInfo(section.el);
    if (info && row) {
      let start = info.lineStart;
      while (start <= info.lineEnd && !/^\s*(?:>\s*)*\|/.test(lines[start] || "")) start++;
      const line = row.rowIndex === 0 ? start : start + 1 + row.rowIndex;
      if (start <= info.lineEnd && isExamRow(line)) return { view, line, live: false };
    }

    // Sinon : le n-ième bouton émoji affiché est le n-ième bouton écrit dans la note (dans la vue visible seulement)
    const scope = add.closest(".markdown-reading-view, .markdown-preview-view, .markdown-source-view") || view.containerEl;
    const shown = Array.from(scope.querySelectorAll("button.exam-emoji-inline-picker[data-exam-emoji-picker]"));
    const index = shown.indexOf(picker);
    if (index < 0) return null;
    let count = -1;
    for (let n = 0; n < lines.length; n++) {
      const found = lines[n].match(EXAM_BUTTON_PATTERN_GLOBAL);
      if (!found) continue;
      if (count + found.length >= index) return { view, line: n, live: false };
      count += found.length;
    }
    return null;
  }

  async insertExam(target, name) {
    const { view, line } = target;
    if (view.getMode() === "source" && view.editor.cm) {
      const cm = view.editor.cm;
      const lines = cm.state.doc.toString().split("\n");
      const result = addExamToTable(lines, line, name);
      if (!result) return;
      // Seul le tableau est réécrit, sans déplacer l'écran ni le curseur
      const top = cm.scrollDOM.scrollTop;
      cm.dispatch({
        changes: {
          from: cm.state.doc.line(result.start + 1).from,
          to: cm.state.doc.line(result.end).to,
          insert: result.tableLines.join("\n"),
        },
      });
      requestAnimationFrame(() => {
        if (cm.scrollDOM.scrollTop !== top) cm.scrollDOM.scrollTop = top;
      });
      return;
    }
    // Mode lecture : l'éditeur caché n'enregistre pas, on écrit dans le fichier
    const preview = view.previewMode;
    const scroll = preview && preview.getScroll ? preview.getScroll() : null;
    await this.app.vault.process(view.file, (data) => {
      const crlf = data.includes("\r\n");
      const lines = data.replace(/\r\n/g, "\n").split("\n");
      const result = addExamToTable(lines, line, name);
      if (!result) return data;
      lines.splice(result.start, result.end - result.start, ...result.tableLines);
      const out = lines.join("\n");
      return crlf ? out.replace(/\n/g, "\r\n") : out;
    });
    if (scroll != null) for (const delay of [0, 100, 300]) setTimeout(() => preview.applyScroll(scroll), delay);
  }
};

// ---------- Colonne « Examen » : une ligne par examen, l'émoji de la catégorie fusionné sur ses lignes (« ^ ») ----------

const LABEL_HEADER = "Examen";
const TABLE_LINE = /^\s*(?:>\s*)*\|/;

function splitRow(line) {
  const m = line.match(/^(\s*(?:>\s*)*)\|([\s\S]*)$/);
  if (!m) return null;
  let rest = m[2];
  let trail = "";
  const t = rest.match(/(?<!\\)\|\s*$/);
  if (t) {
    trail = rest.slice(t.index);
    rest = rest.slice(0, t.index);
  }
  return { prefix: m[1], cells: rest.split(/(?<!\\)\|/).map((c) => c.trim()), trail: trail || "|" };
}

const joinRow = (row) => row.prefix + "| " + row.cells.join(" | ") + " " + row.trail.trimEnd();

// Ajoute l'examen sous la catégorie de la ligne `rowLine` ; crée la colonne Examen si elle n'existe pas.
// Renvoie les nouvelles lignes du tableau et sa position (start inclus, end exclu) dans la note
function addExamToTable(lines, rowLine, name) {
  if (!TABLE_LINE.test(lines[rowLine] || "")) return null;
  let start = rowLine;
  while (start > 0 && TABLE_LINE.test(lines[start - 1])) start--;
  let end = rowLine + 1;
  while (end < lines.length && TABLE_LINE.test(lines[end])) end++;
  const rows = lines.slice(start, end).map(splitRow);
  if (rows.length < 3 || rows.some((r) => !r)) return null;
  let row = rowLine - start;
  if (row < 2) return null;

  // Colonne Examen en deuxième position, créée au premier ajout
  if (rows[0].cells[1] !== LABEL_HEADER) {
    rows.forEach((r, k) => r.cells.splice(1, 0, k === 0 ? LABEL_HEADER : k === 1 ? "---" : ""));
  }
  const width = rows[0].cells.length;
  for (const r of rows) while (r.cells.length < width) r.cells.push(r === rows[1] ? "---" : "");

  // Lignes de la catégorie : la ligne de l'émoji puis celles fusionnées avec elle (« ^ »)
  let last = row;
  while (last + 1 < rows.length && rows[last + 1].cells[0] === "^") last++;
  let target = -1;
  for (let k = row; k <= last; k++) {
    if (!rows[k].cells[1]) {
      target = k;
      break;
    }
  }
  // Libellé précédé de l'émoji de la catégorie (« 🧂 Na »), pour le reconnaître sur chaque ligne
  const found = rows[row].cells[0].match(EXAM_BUTTON_PATTERN);
  const emoji = found ? found[1].trim() : "";
  const label = emoji ? `${emoji} ${name}` : name;
  if (target >= 0) {
    rows[target].cells[1] = label;
  } else {
    const added = { prefix: rows[row].prefix, cells: Array(width).fill(""), trail: "|" };
    added.cells[0] = "^";
    added.cells[1] = label;
    rows.splice(last + 1, 0, added);
  }
  return { start, end, tableLines: rows.map(joinRow) };
}

function addPickersToExamRows(source) {
  const lines = source.split("\n");
  let inExamTable = false;
  let changed = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalized = line
      .replace(/^#+\s*/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    if (line.trimStart().startsWith("#")) {
      inExamTable = normalized.includes("examens complementaires");
      continue;
    }

    if (!inExamTable) continue;
    if (!line.trim().startsWith("|")) {
      if (line.trim() !== "") inExamTable = false;
      continue;
    }

    // Ignore the header separator and rows that already have a picker.
    if (/^\s*\|\s*:?-{3,}/.test(line) || line.includes("data-exam-emoji-picker")) {
      continue;
    }

    // Ligne d'en-tête (suivie du séparateur) : pas de bouton, il n'y servait à rien (case en haut à gauche)
    if (/^\s*\|\s*:?-{3,}/.test(lines[index + 1] || "")) continue;

    // Add the picker only when the first cell of a new row is empty.
    const updatedLine = line.replace(/^(\s*\|)\s*(?=\|)/, `$1 ${EXAM_BUTTON_HTML} `);
    if (updatedLine !== line) {
      lines[index] = updatedLine;
      changed = true;
    }
  }

  return changed ? lines.join("\n") : source;
}

function replaceExamButtonAt(source, targetIndex, emoji) {
  let currentIndex = 0;
  let replaced = false;
  EXAM_BUTTON_PATTERN_GLOBAL.lastIndex = 0;

  const updated = source.replace(EXAM_BUTTON_PATTERN_GLOBAL, (match) => {
    const index = currentIndex;
    currentIndex += 1;
    if (index !== targetIndex) return match;

    replaced = true;
    return `<button class="exam-emoji-inline-picker" data-exam-emoji-picker>${emoji}</button>`;
  });

  return replaced ? updated : source;
}

module.exports._internals = { addExamToTable, labelOfEmoji };

  return module.exports;
})();

// ===== Tableaux : lignes barrées en haut, fusion de cases au clic droit (src/tableaux.js) =====
const module_tableaux = (function () {
  const module = { exports: {} };
const { MarkdownView, Menu, Notice, Plugin, setIcon, getIcon } = require("obsidian");

// ---------- Analyse des tableaux (sans dépendance à Obsidian, testable sous Node) ----------

// Préfixe de citation ou de callout (« > », « >> ») devant une ligne de tableau
function splitPrefix(line) {
  const m = line.match(/^(\s*(?:>\s*)*)([\s\S]*)$/);
  return { key: m[1].replace(/\s/g, ""), body: m[2] };
}

const isSeparator = (body) => /^\|(\s*:?-+:?\s*\|)*\s*:?-+:?\s*\|?\s*$/.test(body.trim());

function splitCells(body) {
  let s = body.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim());
}

// Case entièrement barrée : il ne reste rien de visible une fois le texte barré retiré
const STRIKE = /~~[\s\S]+?~~|<(s|del|strike)>[\s\S]*?<\/\1>/gi;
function isStruckCell(cell) {
  if (!cell) return false;
  let found = false;
  const rest = cell.replace(STRIKE, () => {
    found = true;
    return "";
  });
  // (la pastille 🔴 d'une ligne importante, hors du barré, ne compte pas)
  return found && rest.replace(/<span class="pastille"><\/span>|<br\s*\/?>|&nbsp;|🔴|[*_=\s]/gi, "") === "";
}

// Une ligne est barrée quand sa première case remplie l'est (le nom du médicament, l'antécédent)
const isStruckRow = (cells) => isStruckCell(cells.find((c) => c !== "") || "");
// Ligne fusionnée avec celle du dessus (« ^ » de Sheets Extended) : elle la suit partout
const isContinuation = (cells) => cells.some((c) => c === "^");
// Ligne titre fusionnée sur toute la largeur (« | **Titre** | < | < | ») : sépare deux blocs triés à part
const isTitleRow = (cells) => cells.length > 1 && cells[0] !== "" && cells.slice(1).every((c) => c === "<");

// Tableaux du texte : ligne d'en-tête, séparateur, puis lignes de données, hors blocs de code
function findTables(lines) {
  const tables = [];
  let fence = null;
  let fenceKey = "";
  for (let i = 0; i < lines.length; i++) {
    const { key, body } = splitPrefix(lines[i]);
    const fm = body.match(/^(`{3,}|~{3,})/);
    if (fence) {
      if (fm && key === fenceKey && fm[1][0] === fence[0] && fm[1].length >= fence.length) fence = null;
      continue;
    }
    if (fm) {
      fence = fm[1];
      fenceKey = key;
      continue;
    }
    if (!body.startsWith("|") || i + 1 >= lines.length) continue;
    const next = splitPrefix(lines[i + 1]);
    if (next.key !== key || !isSeparator(next.body)) continue;
    let end = i + 2;
    while (end < lines.length) {
      const p = splitPrefix(lines[end]);
      if (p.key !== key || !p.body.startsWith("|")) break;
      end++;
    }
    tables.push({ start: i, end, header: lines[i] });
    i = end - 1;
  }
  return tables;
}

// Tableaux de traitement : médicaments rangés par l'émoji de classe placé devant leur nom,
// dans le même ordre que les parties des antécédents ; autre émoji ensuite, puis sans émoji
const ORDRE_CLASSES = ["🦀", "🫀", "🧠", "💩", "🦴", "🫁", "🫙", "🎭", "🍬", "🍰", "🩸", "☣"]; // ☣️ antibiotiques (comparé sans le sélecteur de variante)
const EMOJI_DEBUT = /^[\s*_~=]*(\p{Extended_Pictographic})/u;
function rangClasse(cells) {
  const first = (cells.find((c) => c !== "") || "").replace(/<span class="pastille"><\/span>\s*/g, "");
  const m = first.replace(STRIKE, (x) => x.replace(/~~|<\/?(s|del|strike)>/gi, "")).match(EMOJI_DEBUT);
  if (!m) return 1000;
  const k = ORDRE_CLASSES.indexOf(m[1]);
  return k < 0 ? 500 : k;
}
const isTraitementTable = (lines, t) => /Traitement/i.test(t.header);

// Lignes barrées en haut, les autres en dessous, chacune dans son ordre d'origine.
// Avec rank (tableaux de traitement) : d'abord par émoji de classe, puis dans chaque classe les barrées en haut,
// à égalité dans l'ordre d'origine
function sortDataRows(rows, rank = null) {
  const out = [];
  let groups = [];
  const flush = () => {
    if (rank) {
      const sorted = groups.map((g, k) => [g, k]).sort((a, b) => a[0].rank - b[0].rank || b[0].struck - a[0].struck || a[1] - b[1]);
      for (const [g] of sorted) out.push(...g.lines);
    } else {
      for (const g of groups.filter((g) => g.struck)) out.push(...g.lines);
      for (const g of groups.filter((g) => !g.struck)) out.push(...g.lines);
    }
    groups = [];
  };
  for (const line of rows) {
    const cells = splitCells(splitPrefix(line).body);
    if (isTitleRow(cells)) {
      flush();
      out.push(line);
    } else if (isContinuation(cells)) {
      if (groups.length) groups[groups.length - 1].lines.push(line);
      else out.push(line); // collée à l'en-tête ou à une ligne titre : reste en place
    } else {
      groups.push({ lines: [line], struck: isStruckRow(cells), rank: rank ? rank(cells) : 0 });
    }
  }
  flush();
  return out;
}

const dataRows = (lines, t) => lines.slice(t.start + 2, t.end);

const rankFor = (lines, t) => (isTraitementTable(lines, t) ? rangClasse : null);

function needsSort(lines, t) {
  const rows = dataRows(lines, t);
  return sortDataRows(rows, rankFor(lines, t)).some((l, k) => l !== rows[k]);
}

// Trie les tableaux retenus par `pick` (tous par défaut) ; renvoie le texte et le nombre de tableaux modifiés
function sortTables(text, pick = () => true) {
  const lines = text.split("\n");
  let changed = 0;
  findTables(lines).forEach((t, index) => {
    if (!pick(t, index)) return;
    const rows = dataRows(lines, t);
    const sorted = sortDataRows(rows, rankFor(lines, t));
    if (sorted.every((l, k) => l === rows[k])) return;
    lines.splice(t.start + 2, rows.length, ...sorted);
    changed++;
  });
  return { text: lines.join("\n"), changed };
}

// ---------- Fusion de cases (syntaxe Sheets Extended : « < » avec la case de gauche, « ^ » avec celle du dessus) ----------

// Ligne découpée en morceaux bruts entre les « | », espaces compris, pour garder l'alignement du texte
function splitRaw(line) {
  const m = line.match(/^(\s*(?:>\s*)*)\|([\s\S]*)$/);
  if (!m) return null;
  let rest = m[2];
  let trail = "";
  const t = rest.match(/(?<!\\)\|\s*$/);
  if (t) {
    trail = rest.slice(t.index);
    rest = rest.slice(0, t.index);
  }
  return { prefix: m[1], segs: rest.split(/(?<!\\)\|/), trail };
}

const joinRaw = ({ prefix, segs, trail }) => prefix + "|" + segs.join("|") + trail;

function setSeg(seg, text) {
  const s = " " + text + " ";
  return s.length < (seg || "").length ? s + " ".repeat(seg.length - s.length) : s;
}

const MERGE_MARK = (v) => v === "<" || v === "^";

// Rectangle de cases (r = 0 pour l'en-tête, puis 1, 2… pour les lignes de données), mode "merge" ou "unmerge"
function mergeRect(lines, t, rect, mode) {
  const { r1, r2, c1, c2 } = rect;
  const lineOf = (r) => (r === 0 ? t.start : t.start + 1 + r);
  if (lineOf(r2) >= t.end) return { error: "Tableau modifié entretemps, refaites la sélection." };
  const rows = [];
  for (let r = r1; r <= r2; r++) {
    const raw = splitRaw(lines[lineOf(r)]);
    if (!raw) return { error: "Ligne de tableau illisible." };
    while (raw.segs.length <= c2) raw.segs.push(" ");
    rows.push(raw);
  }
  const value = (r, c) => rows[r - r1].segs[c].trim();
  const set = (r, c, text) => {
    rows[r - r1].segs[c] = setSeg(rows[r - r1].segs[c], text);
  };

  if (mode === "merge") {
    if (r1 === r2 && c1 === c2) return { error: "Sélectionnez au moins deux cases." };
    if (r1 === 0 && r2 > 0) return { error: "Sheets Extended ne fusionne pas l'en-tête avec les lignes du dessous." };
    // Rien n'est perdu : les contenus des cases fusionnées passent dans la première, séparés par un retour à la ligne
    const contents = [];
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const v = value(r, c);
        if (v && !MERGE_MARK(v)) contents.push(v);
      }
    }
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        set(r, c, r === r1 && c === c1 ? contents.join("<br>") : c === c1 ? "^" : "<");
      }
    }
  } else {
    let found = false;
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        if (MERGE_MARK(value(r, c))) {
          set(r, c, "");
          found = true;
        }
      }
    }
    if (!found) return { error: "Aucune case fusionnée dans la sélection." };
  }

  const out = lines.slice();
  rows.forEach((raw, k) => {
    out[lineOf(r1 + k)] = joinRaw(raw);
  });
  return { lines: out };
}

// ---------- Plugin ----------


const ICON =
  ["arrow-up-narrow-wide", "list-start", "arrow-up"].find((id) => !getIcon || getIcon(id)) || "arrow-up";
const LABEL = "Remonter les lignes barrées";
const pickIcon = (ids) => ids.find((id) => !getIcon || getIcon(id)) || ids[ids.length - 1];
const MERGE_ICON = pickIcon(["table-cells-merge", "combine", "merge"]);
const SPLIT_ICON = pickIcon(["table-cells-split", "split", "scissors"]);
const BUTTON_CLS = "struck-rows-first-button";

module.exports = class StruckRowsFirstPlugin extends Plugin {
  async onload() {
    this.actionEls = [];
    this.viewsWithAction = new WeakSet();

    // Bouton dans la barre de titre de chaque note : trie tous les tableaux
    const addActions = () => {
      for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
        const view = leaf.view;
        if (!(view instanceof MarkdownView) || this.viewsWithAction.has(view)) continue;
        this.viewsWithAction.add(view);
        this.actionEls.push(
          view.addAction(ICON, `${LABEL} dans les tableaux`, () => this.sortInView(view))
        );
      }
    };
    this.app.workspace.onLayoutReady(addActions);
    this.registerEvent(this.app.workspace.on("layout-change", addActions));

    this.addCommand({
      id: "sort-all-tables",
      name: "Remonter les lignes barrées dans les tableaux de la note",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return false;
        if (!checking) this.sortInView(view);
        return true;
      },
    });

    // Clic droit dans un tableau en mode source : trie ce tableau seulement
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        const cursor = editor.getCursor().line;
        const lines = editor.getValue().split("\n");
        const table = findTables(lines).find((t) => cursor >= t.start && cursor < t.end);
        if (!table || !needsSort(lines, table)) return;
        menu.addItem((item) =>
          item
            .setTitle(`${LABEL} de ce tableau`)
            .setIcon(ICON)
            .onClick(() => {
              const pick = (t) => t.start === table.start && t.header === table.header;
              this.report(this.applyToEditor(editor, (text) => sortTables(text, pick).text));
            })
        );
      })
    );

    // Mode lecture : appel par bloc. Aperçu en direct : appel par case du tableau, on repasse alors sur les tableaux affichés
    this.registerMarkdownPostProcessor((el, ctx) => {
      if (el.classList.contains("table-cell-wrapper")) this.scheduleLiveScan();
      else this.addReadingButtons(el, ctx);
    }, 100);

    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick", "touchstart"]) {
      this.registerDomEvent(window, type, (event) => this.interceptClick(event), { capture: true });
    }

    // Clic droit sur une sélection de cases : Fusionner / Défusionner, ajoutés au menu d'Obsidian.
    // Après Obsidian (phase de remontée) : s'il voit le menu déjà créé, il n'y met plus ses propres entrées
    this.registerDomEvent(document, "contextmenu", (event) => this.onTableContextMenu(event));

    // Aperçu en direct : un tableau peut changer sans que ses cases soient redessinées
    this.registerEvent(this.app.workspace.on("editor-change", () => this.scheduleLiveScan(400)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleLiveScan()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleLiveScan()));

    // Notes déjà affichées à l'activation : le mode lecture garde ses tableaux en cache, on les redessine
    this.app.workspace.onLayoutReady(() => {
      for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
        leaf.view.previewMode?.rerender(true);
      }
      this.scheduleLiveScan();
    });
  }

  onunload() {
    clearTimeout(this.scanTimer);
    for (const el of this.actionEls) el.remove();
    document.querySelectorAll(`.${BUTTON_CLS}`).forEach((b) => b.remove());
  }

  // Petit bouton dans la première case d'en-tête du tableau
  makeButton(cell, live, onClick) {
    const button = createEl("button", {
      cls: ["clickable-icon", BUTTON_CLS, live ? "is-live" : "is-reading"],
      attr: { type: "button", "aria-label": LABEL, title: LABEL },
    });
    setIcon(button, ICON);
    button.struckRowsAction = onClick; // déclenché par interceptClick
    cell.prepend(button);
    return button;
  }

  // Le tableau de l'aperçu en direct capte les clics avant le bouton et ouvre l'édition de la case :
  // on les arrête dès la fenêtre, avant tout autre gestionnaire
  interceptClick(event) {
    const button = event.target instanceof Element && event.target.closest(`.${BUTTON_CLS}`);
    if (!button) return;
    event.stopImmediatePropagation();
    if (event.type !== "touchstart") event.preventDefault();
    if (event.type === "click" && button.struckRowsAction) button.struckRowsAction();
  }

  // ---------- Aperçu en direct ----------

  scheduleLiveScan(delay = 50) {
    clearTimeout(this.scanTimer);
    this.scanTimer = setTimeout(() => this.scanLiveTables(), delay);
  }

  // Tableau du texte qui correspond au tableau affiché
  tableOfWidget(cm, widget, tables) {
    let pos;
    try {
      pos = cm.posAtDOM(widget);
    } catch (e) {
      return null;
    }
    const line = cm.state.doc.lineAt(pos).number - 1;
    return tables.find((t) => line >= t.start && line < t.end) || tables.find((t) => t.start === line + 1) || null;
  }

  scanLiveTables() {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || view.getMode() !== "source") continue;
      const cm = view.editor && view.editor.cm;
      if (!cm || !cm.contentDOM) continue;
      const widgets = cm.contentDOM.querySelectorAll(".cm-table-widget");
      if (!widgets.length) continue;
      const lines = view.editor.getValue().split("\n");
      const tables = findTables(lines);

      widgets.forEach((widget) => {
        const tableEl = widget.querySelector("table");
        const cell = tableEl && tableEl.rows[0] && tableEl.rows[0].cells[0];
        if (!cell) return;
        const existing = cell.querySelector(`:scope > .${BUTTON_CLS}`);
        const table = this.tableOfWidget(cm, widget, tables);
        if (!table || !needsSort(lines, table)) {
          if (existing) existing.remove();
          return;
        }
        if (existing) return;
        this.makeButton(cell, true, () => {
          const now = findTables(view.editor.getValue().split("\n"));
          const target = this.tableOfWidget(cm, widget, now);
          if (!target) return;
          this.report(this.applyToEditor(view.editor, (text) => sortTables(text, (t) => t.start === target.start).text));
          this.scheduleLiveScan();
        });
      });
    }
  }

  // ---------- Fusion de cases ----------

  onTableContextMenu(event) {
    if (!Menu.forEvent) return;
    const target = event.target instanceof Element ? event.target : null;
    const cellEl = target && target.closest("td, th");
    const widget = cellEl && cellEl.closest(".cm-table-widget");
    if (!widget) return;
    const selected = Array.from(widget.querySelectorAll("td.is-selected, th.is-selected"));
    if (selected.length < 2 || !selected.includes(cellEl)) return;
    const view = this.app.workspace
      .getLeavesOfType("markdown")
      .map((l) => l.view)
      .find((v) => v instanceof MarkdownView && v.editor && v.editor.cm && v.editor.cm.contentDOM.contains(widget));
    if (!view) return;

    const rowIdx = selected.map((c) => c.parentElement.rowIndex);
    const colIdx = selected.map((c) => c.cellIndex);
    const rect = {
      r1: Math.min(...rowIdx),
      r2: Math.max(...rowIdx),
      c1: Math.min(...colIdx),
      c2: Math.max(...colIdx),
    };
    const lines = view.editor.getValue().split("\n");
    const table = this.tableOfWidget(view.editor.cm, widget, findTables(lines));
    if (!table) return;

    const menu = Menu.forEvent(event);
    menu.addItem((item) =>
      item
        .setSection("table")
        .setIcon(MERGE_ICON)
        .setTitle("Fusionner les cellules")
        .onClick(() => this.applyRect(view, table, rect, "merge"))
    );
    if (!mergeRect(lines, table, rect, "unmerge").error) {
      menu.addItem((item) =>
        item
          .setSection("table")
          .setIcon(SPLIT_ICON)
          .setTitle("Défusionner les cellules")
          .onClick(() => this.applyRect(view, table, rect, "unmerge"))
      );
    }
  }

  applyRect(view, table, rect, mode) {
    let error = null;
    this.applyToEditor(view.editor, (text) => {
      const lines = text.split("\n");
      // Même tableau qu'à l'ouverture du menu : même ligne de départ et même en-tête
      const t = findTables(lines).find((x) => x.start === table.start && x.header === table.header);
      if (!t) {
        error = "Tableau modifié entretemps, refaites la sélection.";
        return text;
      }
      const r = mergeRect(lines, t, rect, mode);
      if (r.error) {
        error = r.error;
        return text;
      }
      return r.lines.join("\n");
    });
    if (error) new Notice(error);
  }

  // ---------- Mode lecture ----------

  addReadingButtons(el, ctx) {
    const tableEls = Array.from(el.querySelectorAll("table"));
    if (!tableEls.length) return;
    const info = ctx.getSectionInfo(el);
    if (!info) return;
    const lines = info.text.split("\n");
    const inSection = (t) => t.start >= info.lineStart && t.start <= info.lineEnd;
    const tables = findTables(lines).filter(inSection);
    if (tables.length !== tableEls.length) return; // note intégrée ou structure inattendue

    tables.forEach((table, k) => {
      if (!needsSort(lines, table)) return;
      const row = tableEls[k].rows[0];
      const cell = row && row.cells[0];
      if (!cell || cell.querySelector(`.${BUTTON_CLS}`)) return;
      this.makeButton(cell, false, () => {
        // Position du tableau relue au moment du clic, la note a pu bouger depuis l'affichage
        const now = ctx.getSectionInfo(el) || info;
        const pick = (t) => t.header === table.header && t.start >= now.lineStart && t.start <= now.lineEnd;
        this.sortInFile(ctx.sourcePath, el, pick);
      });
    });
  }

  // ---------- Écriture ----------

  sortInView(view) {
    return this.runSort(view, view.file);
  }

  async sortInFile(path, el, pick) {
    const views = this.app.workspace.getLeavesOfType("markdown").map((l) => l.view);
    const view =
      views.find((v) => v instanceof MarkdownView && v.containerEl.contains(el) && v.file && v.file.path === path) ||
      views.find((v) => v instanceof MarkdownView && v.file && v.file.path === path);
    const file = (view && view.file) || this.app.vault.getAbstractFileByPath(path);
    if (file) await this.runSort(view, file, pick);
  }

  // Mode édition : par l'éditeur, annulable avec Ctrl+Z. Mode lecture : l'éditeur caché n'enregistre pas, on passe par le fichier
  async runSort(view, file, pick) {
    if (view && view.getMode() === "source") {
      this.report(this.applyToEditor(view.editor, (text) => sortTables(text, pick).text));
      return;
    }
    if (!file) return;
    // Mode lecture : la note est redessinée après l'écriture, on garde la position de lecture
    const preview = view && view.previewMode;
    const scroll = preview && preview.getScroll ? preview.getScroll() : null;
    let count = 0;
    await this.app.vault.process(file, (text) => {
      const crlf = text.includes("\r\n");
      const r = sortTables(text.replace(/\r\n/g, "\n"), pick);
      count = r.changed;
      if (!r.changed) return text;
      return crlf ? r.text.replace(/\n/g, "\r\n") : r.text;
    });
    if (count && scroll != null) {
      for (const delay of [0, 100, 300]) setTimeout(() => preview.applyScroll(scroll), delay);
    }
    this.report(count);
  }

  // Remplace seulement les lignes qui ont bougé, en une étape annulable (Ctrl+Z)
  applyToEditor(editor, transform) {
    const oldLines = editor.getValue().split("\n");
    const newLines = transform(oldLines.join("\n")).split("\n");
    if (newLines.length !== oldLines.length) return 0;
    let a = 0;
    while (a < oldLines.length && oldLines[a] === newLines[a]) a++;
    if (a === oldLines.length) return 0;
    let b = oldLines.length - 1;
    while (b > a && oldLines[b] === newLines[b]) b--;
    const insert = newLines.slice(a, b + 1).join("\n");
    const cm = editor.cm;
    if (cm && cm.dispatch && cm.scrollDOM) {
      // Directement dans CodeMirror : replaceRange ramène l'écran sur le curseur, souvent en haut de la note
      const top = cm.scrollDOM.scrollTop;
      cm.dispatch({ changes: { from: cm.state.doc.line(a + 1).from, to: cm.state.doc.line(b + 1).to, insert } });
      // Le tableau garde sa hauteur : on remet exactement la même position
      const restore = () => {
        if (cm.scrollDOM.scrollTop !== top) cm.scrollDOM.scrollTop = top;
      };
      requestAnimationFrame(() => {
        restore();
        requestAnimationFrame(restore);
      });
    } else {
      const scroll = editor.getScrollInfo();
      editor.replaceRange(insert, { line: a, ch: 0 }, { line: b, ch: oldLines[b].length });
      editor.scrollTo(scroll.left, scroll.top);
    }
    // Nombre de tableaux touchés, pour le message
    return findTables(newLines).filter((t) => t.end > a && t.start <= b).length;
  }

  report(count) {
    new Notice(
      count
        ? `Lignes barrées remontées dans ${count} tableau${count > 1 ? "x" : ""}.`
        : "Aucune ligne barrée à remonter."
    );
  }
};

module.exports._internals = { rangClasse, findTables, sortTables, sortDataRows, needsSort, isStruckCell, splitCells, mergeRect, splitRaw };

  return module.exports;
})();

// ===== Tableau des examens : boutons de catégorie, dates et colonne Examen fixes (src/filtres.js) =====
const module_filtres = (function () {
  const module = { exports: {} };
const { MarkdownView, Menu, Notice, Plugin, TFile, setIcon } = require("obsidian");

// Tableau des examens : boutons de catégorie au-dessus (🧂, 🧪, 🩸…), un clic n'affiche que cette catégorie (la première par défaut).
// Les dates (ligne d'en-tête) et la colonne Examen restent visibles pendant le défilement (voir filtres.css).
// Rien n'est écrit dans la note : le filtre ne vit que dans l'affichage, mémorisé par note le temps de la session.

const EMOJI = /^\s*(\p{Extended_Pictographic}️?)/u;
const DONE = "examFiltreFait";
const MESURE = "examFiltreMesure"; // hauteur et décalage mesurés sur le tableau affiché

const textOf = (cell) => (cell.textContent || "").trim();

function isExamTable(table) {
  const head = table.querySelector("thead tr") || table.querySelector("tr");
  return !!head && [...head.children].some((c) => textOf(c) === "Examen");
}

// Catégorie de chaque ligne : premier émoji trouvé dans ses cases, sinon celle de la ligne précédente (cases fusionnées).
function categorize(table) {
  const rows = [...table.querySelectorAll("tbody tr")];
  let current = "";
  return rows.map((tr) => {
    // Ligne avec son propre bouton émoji : elle prend la catégorie du bouton. Bouton vide sur une ligne entièrement vide :
    // nouveau bloc sans catégorie (ces lignes étaient rangées à tort dans la dernière catégorie, ☣️ par exemple) ;
    // bouton vide sur une ligne remplie (« Hémocultures ») : elle garde la catégorie du dessus
    const own = tr.querySelector("button.exam-emoji-inline-picker");
    if (own) {
      const emo = ((own.textContent || "").match(EMOJI) || [, ""])[1].replace(/️/g, "");
      const vide = [...tr.children].every((c) => c.contains(own) || !textOf(c));
      if (emo || vide) current = emo;
    }
    for (const cell of tr.children) {
      const m = textOf(cell).match(EMOJI);
      if (m) {
        current = m[1].replace(/️/g, "");
        break;
      }
    }
    return { tr, cat: current };
  });
}

// Marque la case Examen de chaque ligne (et la case émoji fusionnée) pour qu'elles restent collées à gauche.
function markLabelCells(table) {
  const head = table.querySelector("thead tr") || table.querySelector("tr");
  const headCells = [...head.children];
  const examIdx = headCells.findIndex((c) => textOf(c) === "Examen");
  headCells.forEach((c, i) => c.classList.toggle("exam-filtre-fixe", i <= examIdx));
  headCells.forEach((c, i) => c.classList.toggle("exam-filtre-label", i === examIdx));
  const full = headCells.length;
  for (const tr of table.querySelectorAll("tbody tr")) {
    const cells = [...tr.children];
    const missing = full - cells.reduce((n, c) => n + (Number(c.getAttribute("colspan")) || 1), 0);
    const idx = examIdx - Math.max(0, missing);
    cells.forEach((c, i) => {
      c.classList.toggle("exam-filtre-fixe", i <= idx);
      c.classList.toggle("exam-filtre-label", i === idx);
    });
  }
  // Décalage de la colonne Examen = largeur de la colonne émoji
  const first = headCells[0];
  const left = examIdx > 0 && first ? first.getBoundingClientRect().width : 0;
  table.style.setProperty("--exam-filtre-gauche", left + "px");
}

// ---------- Boutons Copier dans les tableaux ----------
// Tableau des jours (1re colonne « Date ») : un bouton par date, qui copie « Sur le plan cardiaque : … », puis « CAT : … ».
// Tableau des examens : un bouton par date d'en-tête, qui copie la biologie du jour, une ligne par catégorie (🧂 seul sur sa ligne).

const NO_EMOJI = /[\p{Extended_Pictographic}️]/gu;
const mdCells = (l) => l.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim());
const isMdSep = (l) => /^\s*\|[\s|:-]+\|\s*$/.test(l);
const plain = (s, br = " ") =>
  (s || "")
    .replace(/<br\s*\/?>/gi, br)
    .replace(/~~[\s\S]*?~~/g, "")
    .replace(/==|\*\*|__/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (m, a, b) => b || a)
    .split(br === "\n" ? "\n" : /\n/)
    .map((x) => x.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join(br === "\n" ? "\n" : " ")
    .trim();
const label = (s) => plain(s).replace(NO_EMOJI, "").trim();
const dateOf = (s) => label(s).replace(/[*_]/g, "").replace(/\s+/g, " ").trim();
// Texte d'une case sans le jour de la semaine ajouté à l'affichage
const texteCase = (cell) => {
  const j = cell.querySelector(":scope > .jour-semaine");
  return j ? (cell.textContent || "").replace(j.textContent, "") : cell.textContent || "";
};
// Jour de la semaine d'une date « jj/mm » (année déduite : une date à plus de 2 mois dans le futur est de l'année d'avant)
const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
function jourSemaine(txt, aujourdhui = new Date()) {
  const m = (txt || "").match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return "";
  const j = +m[1], mo = +m[2] - 1;
  let an = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : aujourdhui.getFullYear();
  let d = new Date(an, mo, j);
  if (!m[3] && d - aujourdhui > 60 * 864e5) d = new Date(--an, mo, j);
  return d.getDate() === j && d.getMonth() === mo ? JOURS[d.getDay()] : "";
}
const isCat = (name) => /^(CAT|conduite à tenir)\b/i.test(name.replace(/[()]/g, " ").trim());
const lowerFirst = (s) => (/^\p{Lu}\p{Ll}/u.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const upperFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
// « Sur le plan … » : tournure par colonne quand le nom seul sonne mal ; sinon le nom, minuscule au premier mot (sigles gardés)
const PLAN = { ionogramme: "ionique", tabac: "du tabac", "général": "général" };

// Unités par défaut (normes du labo à venir). Une unité écrite dans le nom de l'examen, « NT-proBNP (ng/L) », passe avant.
const UNITS = {
  na: "mmol/L", k: "mmol/L", cl: "mmol/L", chlore: "mmol/L", bicarbonates: "mmol/L", hco3: "mmol/L", "rés. alcaline": "mmol/L",
  "créatinine": "µmol/L", dfg: "mL/min/1,73 m²", "urée": "mmol/L", mg: "mmol/L", "magnésium": "mmol/L",
  calcium: "mmol/L", "calcémie": "mmol/L", "calcium corrigé": "mmol/L", phosphore: "mmol/L", "phosphorémie": "mmol/L",
  crp: "mg/L", pct: "µg/L", "procalcitonine": "µg/L", bnp: "ng/L", "nt-probnp": "ng/L", troponine: "ng/L", "troponine us": "ng/L",
  "protéines": "g/L", "protidémie": "g/L", albumine: "g/L", "préalbumine": "g/L",
  asat: "UI/L", alat: "UI/L", ggt: "UI/L", pal: "UI/L", lipase: "UI/L", ldh: "UI/L", cpk: "UI/L",
  bilirubine: "µmol/L", "bilirubine totale": "µmol/L", "bilirubine libre": "µmol/L", "bilirubine conjuguée": "µmol/L",
  ferritine: "µg/L", fer: "µmol/L", transferrine: "g/L", cst: "%", haptoglobine: "g/L",
  b9: "ng/mL", "folates": "ng/mL", b12: "pmol/L", "vitamine d": "nmol/L", "25-oh vitamine d": "nmol/L",
  "glycémie": "g/L", hba1c: "%", "acide urique": "µmol/L", "uricémie": "µmol/L", lactates: "mmol/L",
  tsh: "mUI/L", t4: "pmol/L", "t4l": "pmol/L", psa: "ng/mL", igg: "g/L", iga: "g/L", igm: "g/L",
  "cll k": "mg/L", "cll l": "mg/L", "d-dimères": "ng/mL", "ddimères": "ng/mL", "cholestérol": "g/L", "triglycérides": "g/L", ldl: "g/L", hdl: "g/L",
  hb: "g/dL", "hémoglobine": "g/dL", vgm: "fL", tcmh: "pg", ccmh: "g/dL", ht: "%", "hématocrite": "%",
  gb: "G/L", leucocytes: "G/L", pnn: "G/L", "neutrophiles": "G/L", lymphocytes: "G/L", monocytes: "G/L",
  "éosinophiles": "G/L", "basophiles": "G/L", "réticulocytes": "G/L", plaquettes: "G/L",
  tp: "%", fii: "%", fv: "%", fvii: "%", fx: "%", "fibrinogène": "g/L", inr: "", tca: "",
};
const unitOf = (name) => UNITS[name.toLowerCase().trim()] || "";
// La valeur commence par un nombre sans unité collée derrière : l'unité s'insère juste après le nombre (« 62 (2N) » → « 62 UI/L (2N) »)
function withUnit(v, unit) {
  if (!unit) return v;
  const m = v.match(/^([<>≤≥]?\s*\d+(?:[.,]\d+)?)(.*)$/s);
  if (!m || /^\s*(?:[%µ]|[A-Za-z]{1,4}\b|\/)/.test(m[2])) return v;
  return m[1] + " " + unit + m[2];
}

// rang : quand plusieurs lignes portent la même date (jour et soir), 0 pour la première, 1 pour la suivante…
function dayText(ls, date, rang = 0) {
  const h = ls.findIndex((l) => /^\s*\|/.test(l) && dateOf(mdCells(l)[0]) === "Date");
  if (h < 0) return "";
  const head = mdCells(ls[h]).map(label);
  let vues = 0;
  for (let i = h + 1; i < ls.length && /^\s*\|/.test(ls[i]); i++) {
    if (isMdSep(ls[i])) continue;
    const c = mdCells(ls[i]);
    if (!date || dateOf(c[0]) !== date) continue;
    if (vues++ < rang) continue;
    const parts = [];
    let cat = "";
    // Toutes les colonnes présentes, dans l'ordre, quel que soit leur nombre ; cases vides ou manquantes ignorées ; CAT toujours en dernier
    head.forEach((name, j) => {
      if (!j || !c[j]) return;
      if (isCat(name)) {
        const items = plain(c[j], "\n").split("\n").map((x, n) => (n ? lowerFirst(x) : upperFirst(x)));
        if (items.length) cat = "CAT : " + items.join(" ; ").replace(/[.;]\s*$/, "") + ".";
      } else {
        const v = plain(c[j]);
        if (!v) return;
        // En-tête déjà rédigé « Sur le plan des vertiges » : on ne rajoute pas « Sur le plan »
        const n = name.replace(/^sur le plan\s+/i, "");
        parts.push(n ? "Sur le plan " + (PLAN[n.toLowerCase()] || lowerFirst(n)) + " : " + lowerFirst(v) : upperFirst(v));
      }
    });
    if (cat) parts.push(cat);
    return parts.join("\n\n");
  }
  return "";
}

function bioText(ls, colIdx) {
  const h = ls.findIndex((l) => /^\s*\|/.test(l) && mdCells(l).some((c) => plain(c) === "Examen"));
  if (h < 0) return "";
  const head = mdCells(ls[h]);
  const ex = head.findIndex((c) => plain(c) === "Examen");
  const groups = new Map();
  const emojiOf = (s) => ((s || "").match(/(\p{Extended_Pictographic})/u) || [, ""])[1];
  let cat = "";
  for (let i = h + 1; i < ls.length && /^\s*\|/.test(ls[i]); i++) {
    if (isMdSep(ls[i])) continue;
    const c = mdCells(ls[i]);
    const raw = plain(c[ex] || "");
    // Catégorie de la ligne : émoji du bouton de la 1re colonne, « ^ » = même catégorie que la ligne du dessus,
    // à défaut l'émoji écrit devant le nom de l'examen (« CRP » sans émoji reste avec 🧪 si sa ligne a le bouton 🧪)
    const before = c.slice(0, ex).join(" ");
    if (!before.trim().startsWith("^")) cat = emojiOf(plain(before)) || emojiOf(raw) || (raw ? cat : "");
    else if (!cat) cat = emojiOf(raw);
    const v = plain(c[colIdx] || "");
    if (!raw || !v || v === "^" || v === "<") continue;
    const emo = cat || emojiOf(raw);
    let name = raw.replace(NO_EMOJI, "").trim();
    let unit = "";
    const m = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
    if (m) [name, unit] = [m[1], m[2]];
    if (!groups.has(emo)) groups.set(emo, []);
    groups.get(emo).push(`${name} ${withUnit(v, unit || unitOf(name))}`);
  }
  return [...groups.values()].map((g) => g.join(", ")).join("\n");
}

// Traitements (mêmes règles que l'ancien bloc « À copier ») :
// habituel = tableau « Traitement habituel » tel quel ; actuel = médicaments non barrés des deux tableaux.
function traitement(ls, actuel) {
  const h = ls.findIndex((l) => /^#{1,6}\s/.test(l.trim()) && /Traitement/i.test(l));
  if (h < 0) return "";
  const out = [];
  let inHabituel = false;
  for (let i = h + 1; i < ls.length && !/^#{1,6}\s/.test(ls[i].trim()); i++) {
    const l = ls[i];
    if (!/^\s*\|/.test(l)) { inHabituel = false; continue; }
    if (isMdSep(l)) continue;
    const raw = mdCells(l);
    const c0 = raw.map((x) => plain(x));
    if (c0.length > 1 && c0.slice(1).every((x) => x === "<" || x === "^")) { inHabituel = /habituel/i.test(c0[0]); continue; }
    if (c0[0] === "Nom") continue;
    if (!actuel && !inHabituel) continue;
    const c = actuel
      ? raw.map((x) => plain(x.replace(/<br\s*\/?>/gi, ", ")).replace(/(,\s*)+(?=,)/g, "").replace(/^,\s*|,\s*$/g, ""))
      : raw.map((x) => plain(x.replace(/~~/g, ""), " "));
    c[0] = (c[0] || "").replace(NO_EMOJI, "").replace(/‍/g, "").trim(); // émoji de classe devant le médicament : pas copié
    if (c[0]) out.push(c[1] ? `${c[0]} : ${c[1]}` : c[0]);
  }
  return out.join("\n");
}

// ---------- Parties du tableau des antécédents ----------
// Bouton + dans la 1re case du tableau : menu des parties absentes, insérée à sa place dans cet ordre
// (oncologiques, cardiaques, neurologiques, digestifs, rhumatologiques, les autres spécialités, Autres, chirurgicaux en dernier).
const PARTIES = [
  ["🦀", "Oncologiques"], ["🫀", "Cardiaques"], ["🧠", "Neurologiques"], ["💩", "Digestifs"], ["🦴", "Rhumatologiques"],
  ["🫁", "Pneumologiques"], ["🫙", "Néphro-uro"], ["🎭", "Psychiatriques"],
  ["🍬", "Endocrinologiques"], ["🍰", "Dermatologiques"], ["🩸", "Hématologiques"], ["☣️", "Infectieux"], ["", "Autres"], ["🔪", "Chirurgicaux"],
];
const partieTitre = ([e, n]) => (e ? e + " " + n : n);
// Rang d'une ligne titre dans PARTIES, d'après son texte (« 🫀 Cardiaques » ou ancien « Antécédents cardiaques ») ; -1 si inconnue
function partieRang(line) {
  const t = label(line).toLowerCase().replace(/antécédents/g, "").replace(/[|<*]/g, " ").trim();
  if (/^médicaux/.test(t)) return PARTIES.findIndex(([, n]) => n === "Autres"); // ancien titre « Antécédents médicaux »
  return PARTIES.findIndex(([, n]) => t === n.toLowerCase() || t.split(/\s+/)[0] === n.toLowerCase());
}
const isTitleLine = (l) => {
  if (!/^\s*\|/.test(l) || isMdSep(l)) return false;
  const c = mdCells(l);
  return c.length > 1 && c.slice(1).every((x) => x === "<");
};
const isPartieTitre = (s) => /^Antécédents\b/i.test(s) || PARTIES.some(([, n]) => s.toLowerCase() === n.toLowerCase());

// Texte de la note avec la partie ajoutée, ou null
function ajouterPartie(text, rang) {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const ls = text.split(/\r?\n/);
  const h = ls.findIndex((l) => /^#{1,6}\s/.test(l.trim()) && /Antécédents/i.test(l));
  if (h < 0) return null;
  let a = h + 1;
  while (a < ls.length && !/^\s*\|/.test(ls[a])) {
    if (/^#{1,6}\s/.test(ls[a].trim())) return null;
    a++;
  }
  let b = a;
  while (b < ls.length && /^\s*\|/.test(ls[b])) b++;
  if (b === a) return null;
  const titres = [];
  for (let i = a; i < b; i++) if (isTitleLine(ls[i])) titres.push({ i, r: partieRang(ls[i]) });
  if (titres.some((t) => t.r === rang)) return null;
  const cols = mdCells(ls[a]).length;
  const titre = "| **" + partieTitre(PARTIES[rang]) + "** |" + " < |".repeat(cols - 1);
  const vide = "|" + "  |".repeat(cols);
  const suivant = titres.find((t) => t.r > rang);
  if (!suivant) ls.splice(b, 0, titre, vide);
  else if (suivant.i === a) ls.splice(a, 2, titre, ls[a + 1], vide, ls[a]); // nouvelle 1re partie : elle prend l'en-tête
  else ls.splice(suivant.i, 0, titre, vide);
  return ls.join(nl);
}

// Nouvelle colonne de date à droite du tableau des examens (en-tête « jj/mm » du jour), ou null
function ajouterColonne(text, date) {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const ls = text.split(/\r?\n/);
  const h = ls.findIndex((l) => /^\s*\|/.test(l) && mdCells(l).some((c) => plain(c) === "Examen"));
  if (h < 0) return null;
  if (mdCells(ls[h]).some((c) => plain(c) === date)) return "!La colonne du " + date + " existe déjà";
  for (let i = h; i < ls.length && /^\s*\|/.test(ls[i]); i++) {
    const cell = i === h ? " " + date + " " : isMdSep(ls[i]) ? " --- " : "  ";
    ls[i] = /\|\s*$/.test(ls[i]) ? ls[i].replace(/\s*$/, "") + cell + "|" : ls[i] + " |" + cell + "|";
  }
  return ls.join(nl);
}

function copyButton(cell, build, app, path) {
  if (cell.querySelector(":scope > .tableau-copier")) return;
  const btn = createEl("button", { cls: "tableau-copier clickable-icon", attr: { "aria-label": "Copier", type: "button" } });
  setIcon(btn, "copy");
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Texte de la note affichée autour du bouton (même pas encore enregistré) ; sinon le fichier.
    // Pas « le premier onglet de la note trouvé » : un autre onglet ou une autre fenêtre pouvait donner une version ancienne.
    // getViewData et pas l'éditeur : en mode lecture, l'éditeur caché garde l'ancien texte après une modification
    // venue d'ailleurs (autre PC par Sync, pastille), et la copie donnait une version périmée
    let src = null;
    app.workspace.iterateAllLeaves((leaf) => {
      const v = leaf.view;
      if (src === null && v && v.file && v.file.path === path && v.getViewData && v.containerEl.contains(btn)) src = v.getViewData();
    });
    if (src === null) {
      const file = app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return;
      src = await app.vault.read(file);
    }
    // Pastilles d'importance (« - [!] », « 🔴 ») retirées : elles ne vont pas dans le texte copié
    const text = build(src.split(/\r?\n/).map((l) => l.replace(/^(\s*(?:>\s*)*[-*+]\s+)\[!\]\s+/, "$1").replace(/\s*🔴/g, "").replace(/<span class="pastille"><\/span>\s*/g, "")));
    if (!text) return void new Notice("Rien à copier");
    // Presse-papiers refusé (fenêtre sans le focus) : l'ancien contenu restait, sans message
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      const ta = document.body.createEl("textarea");
      ta.value = text;
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) return void new Notice("Copie impossible, réessayer");
    }
    setIcon(btn, "check");
    setTimeout(() => setIcon(btn, "copy"), 1500);
  });
  cell.prepend(btn);
}

module.exports = class ExamFiltresPlugin extends Plugin {
  onload() {
    this.choix = new Map(); // chemin de la note -> catégorie choisie ("" = tout)
    // Tableau des jours : position de défilement par note, gardée pendant que la note est ouverte
    // (le tableau redessiné au clic dans une case ne repart pas en bas) ; oubliée à la réouverture : retour en bas
    this.posJours = new Map();
    // Positions oubliées à l'ouverture d'une autre note : en y revenant, le tableau des jours repart en bas
    this.noteOuverte = null;
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      if (!file || file.path === this.noteOuverte) return;
      this.noteOuverte = file.path;
      for (const k of [...this.posJours.keys()]) if (k.endsWith("|" + file.path)) this.posJours.delete(k);
    }));

    // Passage lecture <-> modification : le tableau devient visible sans que le DOM change
    this.mesures = new WeakMap();
    this.visibilite = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting && this.mesures.has(e.target)) this.mesures.get(e.target)();
    });
    this.register(() => this.visibilite.disconnect());

    this.registerMarkdownPostProcessor((el, ctx) => {
      setTimeout(() => this.scan(el, ctx.sourcePath), 0);
    });

    // Aperçu direct : les tableaux sont rendus par l'éditeur, on les surveille
    let pending = false;
    // Traité avant l'affichage (microtâche) : le tableau redessiné (case sélectionnée, changement de mode)
    // n'apparaît jamais une image avec toutes ses lignes, ce qui faisait sauter la note
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        this.scanWorkspace();
      });
    });
    observer.observe(this.app.workspace.containerEl, { childList: true, subtree: true });
    this.register(() => observer.disconnect());
    this.app.workspace.onLayoutReady(() => this.scanWorkspace());

    // En-tête figé aussi quand c'est la note qui défile : l'en-tête n'est collant que dans le cadre du tableau,
    // il sortait de l'écran avec le haut du tableau. On le décale de la hauteur du tableau passée au-dessus de l'écran.
    let calcul = false;
    const suivreNote = () => {
      if (calcul) return;
      calcul = true;
      requestAnimationFrame(() => {
        calcul = false;
        for (const table of this.app.workspace.containerEl.querySelectorAll("table.tableau-jours, table.exam-filtrable, table.tableau-long")) {
          const cadre = table.closest(".cm-scroller, .markdown-preview-view");
          if (!cadre || !table.offsetParent) continue;
          const t = table.getBoundingClientRect();
          const haut = cadre.getBoundingClientRect().top;
          const entete = table.querySelector("thead") || table.querySelector("tr");
          const max = Math.max(0, table.clientHeight - (entete ? entete.offsetHeight : 0));
          const dec = Math.round(Math.min(Math.max(0, haut - t.top), max)) + "px";
          if (table.style.getPropertyValue("--entete-decalage") !== dec) table.style.setProperty("--entete-decalage", dec);
        }
      });
    };
    this.registerDomEvent(document, "scroll", suivreNote, { capture: true, passive: true });
    this.registerDomEvent(window, "resize", suivreNote);

    const rescan = () => requestAnimationFrame(() => this.scanWorkspace());
    this.registerEvent(this.app.workspace.on("layout-change", rescan));
    this.registerEvent(this.app.workspace.on("active-leaf-change", rescan));
  }

  onunload() {
    document.querySelectorAll(".exam-filtre-barre, .tableau-copier").forEach((b) => b.remove());
    document.querySelectorAll("table.tableau-jours").forEach((t) => t.classList.remove("tableau-jours"));
    document.querySelectorAll("table.exam-filtrable").forEach((t) => {
      t.classList.remove("exam-filtrable");
      delete t.dataset[DONE];
      delete t.dataset[MESURE];
      t.querySelectorAll("tr").forEach((tr) => (tr.style.display = ""));
      t.style.height = "";
    });
  }

  scanWorkspace() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const path = leaf.view && leaf.view.file ? leaf.view.file.path : "";
      if (leaf.view && leaf.view.containerEl) this.scan(leaf.view.containerEl, path);
    });
  }

  scan(root, path) {
    for (const table of root.querySelectorAll("table")) {
      if (path) this.addCopyButtons(table, path);
      this.marquerTableauLong(table);
      if (table.dataset[DONE]) {
        if (!table.previousElementSibling || !table.previousElementSibling.classList.contains("exam-filtre-barre")) {
          delete table.dataset[DONE]; // barre effacée par un nouveau rendu : on la remet
        } else {
          if (!table.dataset[MESURE] && this.mesures.has(table)) this.mesures.get(table)();
          continue;
        }
      }
      if (!isExamTable(table)) continue;
      this.enhance(table, path || "");
    }
  }

  // Autre tableau plus haut que les trois quarts de la note (note des normes, par exemple) : en-tête figé
  // pendant le défilement de la note, comme le tableau des jours (voir --entete-decalage)
  marquerTableauLong(table) {
    if (table.classList.contains("tableau-jours") || table.classList.contains("exam-filtrable")) return;
    const cadre = table.closest(".cm-scroller, .markdown-preview-view");
    if (!cadre || !table.offsetParent || !table.querySelector("thead")) return;
    const long = table.offsetHeight > cadre.clientHeight * 0.75;
    if (long !== table.classList.contains("tableau-long")) table.classList.toggle("tableau-long", long);
  }

  addCopyButtons(table, path) {
    const head = table.querySelector("thead tr") || table.querySelector("tr");
    if (!head) return;
    const headCells = [...head.children];
    if (headCells.length && dateOf(headCells[0].textContent) === "Date") {
      table.classList.add("tableau-jours");
      this.positionJours(table, path);
      // Un bouton par ligne, même encore vide : la date est relue au clic (lignes et colonnes ajoutées au fur et à mesure)
      for (const tr of table.querySelectorAll("tbody tr")) {
        const cell = tr.children[0];
        if (!cell) continue;
        // Date et rang relus au clic ; deux lignes du même jour : chacune copie la sienne (pas toujours la première)
        copyButton(cell, (ls) => {
          const date = dateOf(texteCase(cell));
          const lignes = tr.parentElement ? [...tr.parentElement.children] : [tr];
          const rang = lignes.slice(0, lignes.indexOf(tr)).filter((r) => r.children[0] && dateOf(texteCase(r.children[0])) === date).length;
          return dayText(ls, date, rang);
        }, this.app, path);
        // Jour de la semaine sous la date (affichage seulement, rien n'est écrit dans la note)
        const jour = jourSemaine(dateOf(texteCase(cell)));
        const ancien = cell.querySelector(":scope > .jour-semaine");
        if (ancien && ancien.textContent !== jour) ancien.remove();
        if (jour && !cell.querySelector(":scope > .jour-semaine")) cell.createDiv({ cls: "jour-semaine", text: jour });
      }
      return;
    }
    const titre = headCells.length ? label(headCells[0].textContent) : "";
    if (isPartieTitre(titre)) return void this.addPartieButton(headCells[0], path);
    if (/^Traitement( habituel| actuel)?$/i.test(titre)) {
      const actuel = !/habituel/i.test(titre); // « Traitement » seul (tableau unique) : médicaments en cours, non barrés
      copyButton(headCells[0], (ls) => traitement(ls, actuel), this.app, path);
      return;
    }
    const ex = headCells.findIndex((c) => textOf(c) === "Examen");
    if (ex < 0) return;
    this.addColonneButton(headCells[headCells.length - 1], path);
    headCells.forEach((cell, i) => {
      // Rang de la colonne relu au clic : une date insérée plus tard ne décale pas les boutons
      if (i > ex && textOf(cell)) copyButton(cell, (ls) => bioText(ls, [...cell.parentElement.children].indexOf(cell)), this.app, path);
    });
  }

  // + dans la dernière case de l'en-tête des examens : colonne du jour ajoutée à droite (mode modification seulement, voir filtres.css)
  // Tableau des jours affiché en bas (derniers jours) à l'ouverture de la note ; ensuite il garde la position choisie,
  // même redessiné (clic dans une case, passage lecture/modification), jusqu'à la réouverture de la note
  positionJours(table, path) {
    this.garderPosition(table, "jours|" + path, true);
  }

  // Défilement interne d'un tableau (jours, examens) gardé par note :
  // - nouveau tableau (autre mode, tableau recréé) : remis à la position gardée, sinon en bas (bas = true) ou en haut ;
  // - même tableau redessiné (case modifiée en mode modification) : sa hauteur retombe un instant et le défilement
  //   repartait à 0, enregistré comme nouvelle position ; on remet la position d'avant le redessin.
  garderPosition(table, key, bas) {
    if (table.dataset.posGardee) return;
    table.dataset.posGardee = "1";
    let redessin = false;
    // Clic dans une case (mode modification) : la colonne éditée s'élargit, les lignes au-dessus raccourcissent et tout
    // remontait ; l'éditeur peut aussi faire défiler vers le haut de la case. On garde la ligne cliquée au même endroit
    // de l'écran : sa position est notée au clic, puis rétablie dans les instants qui suivent.
    // (Obsidian peut remplacer le tableau au clic : le recalage vise le tableau de cette note affiché à ce moment.)
    table.dataset.cle = key;
    if (!this.ancres) this.ancres = new Map();
    const ancreActive = () => {
      const a = this.ancres.get(key);
      return a && performance.now() < a.fin ? a : null;
    };
    table.addEventListener("pointerdown", (e) => {
      const tr = e.target instanceof Element && e.target.closest("tr");
      // Barre de défilement (cible = le tableau lui-même) ou en-tête : rien à faire
      if (!tr || !table.contains(tr) || tr.closest("thead")) return;
      this.ancres.set(key, { idx: tr.rowIndex, top: tr.getBoundingClientRect().top - table.getBoundingClientRect().top, fin: performance.now() + 3000 });
      const recaler = () => {
        const a = ancreActive();
        if (!a) return;
        for (const t of this.app.workspace.containerEl.querySelectorAll("table")) {
          if (t.dataset.cle !== key || !t.isConnected || !t.offsetParent) continue;
          const r = t.rows[a.idx];
          if (!r) continue;
          // Position par rapport au tableau : un défilement de la note ne compte pas
          const d = r.getBoundingClientRect().top - t.getBoundingClientRect().top - a.top;
          if (Math.abs(d) <= 2) continue;
          // Tableau déjà en bas de son défilement : il ne pourrait pas descendre plus ; une marge temporaire en bas
          // (retirée à la molette) donne la place nécessaire
          const manque = t.scrollTop + d - (t.scrollHeight - t.clientHeight);
          if (manque > 0) t.style.paddingBottom = (parseFloat(t.style.paddingBottom) || 0) + Math.ceil(manque) + "px";
          t.scrollTop += d;
        }
      };
      requestAnimationFrame(() => {
        recaler();
        requestAnimationFrame(recaler);
      });
      // Le réarrangement des colonnes dure jusqu'à 2 s après le clic : on suit chaque changement de taille des lignes
      if (this.suiviLignes) this.suiviLignes.disconnect();
      this.suiviLignes = new ResizeObserver(() => recaler());
      for (const r of table.rows) this.suiviLignes.observe(r);
      const suivi = this.suiviLignes;
      setTimeout(() => suivi.disconnect(), 3000);
    }, { capture: true });
    table.addEventListener("wheel", () => {
      this.ancres.delete(key);
      if (table.style.paddingBottom) table.style.paddingBottom = "";
    }, { passive: true, capture: true });
    // Position gardée = distance au bas du tableau (tableau des jours, calé en bas) ou au haut (examens) :
    // en lecture et en modification les lignes n'ont pas la même hauteur, la distance au bas reste juste
    const lire = () => (bas ? table.scrollHeight - table.clientHeight - table.scrollTop : table.scrollTop);
    const appliquer = (v) => (table.scrollTop = bas ? table.scrollHeight - table.clientHeight - v : v);
    const visible = () => table.isConnected && !!table.offsetParent && table.clientHeight > 0;
    table.addEventListener("scroll", () => {
      // Tableau qu'on cache (passage lecture <-> modification) : il retombe à 0 sans que l'utilisateur ait défilé ;
      // ce 0 ne doit pas devenir la position du tableau de l'autre mode
      if (!visible()) return;
      if (!redessin) this.posJours.set(key, lire());
    }, { passive: true });
    const placer = () => {
      if (!visible()) return false;
      const pos = this.posJours.get(key);
      appliquer(pos === undefined ? 0 : pos);
      this.posJours.set(key, lire());
      return true;
    };
    const mo = new MutationObserver(() => {
      if (!table.isConnected) return void mo.disconnect();
      const pos = this.posJours.get(key);
      if (pos === undefined || !visible()) return;
      redessin = true;
      // Ligne cliquée à garder en place (ancre) : c'est elle qui décide de la position, pas le défilement d'avant
      if (!ancreActive() && Math.abs(lire() - pos) > 1) appliquer(pos);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          redessin = false;
          if (visible()) this.posJours.set(key, lire());
        });
      });
    });
    mo.observe(table, { childList: true, subtree: true, characterData: true });
    this.register(() => mo.disconnect());
    placer();
    // Tableau caché (autre mode, onglet en arrière-plan) : replacé à chaque réapparition, sur la position commune
    // aux deux modes (passage lecture -> modification : même endroit du tableau)
    if (!this.visiPos) {
      this.placeurs = new WeakMap();
      this.visiPos = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting && this.placeurs.has(e.target)) this.placeurs.get(e.target)();
      });
      this.register(() => this.visiPos.disconnect());
    }
    this.placeurs.set(table, placer);
    this.visiPos.observe(table);
  }

  addColonneButton(cell, path) {
    if (cell.querySelector(":scope > .exam-ajout-colonne")) return;
    const btn = createEl("button", { cls: "exam-ajout-colonne", text: "+", attr: { type: "button", "aria-label": "Ajouter une colonne (date du jour)" } });
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const d = new Date();
      const date = String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
      const view = this.app.workspace.getLeavesOfType("markdown").map((l) => l.view)
        .find((v) => v instanceof MarkdownView && v.file && v.file.path === path && v.containerEl.contains(btn));
      await this.ecrire(view, path, (t) => ajouterColonne(t, date));
    });
    cell.append(btn);
  }

  // Écrit fn(texte) dans la note : par l'éditeur en mode modification (Ctrl+Z, sans saut d'écran), sinon par le fichier.
  // fn renvoie le nouveau texte, null (rien à faire) ou « !message »
  async ecrire(view, path, fn) {
    const dire = (r) => new Notice(r === null ? "Tableau introuvable" : r.slice(1));
    if (view && view.getMode() === "source" && view.editor) {
      const old = view.editor.getValue();
      const neu = fn(old);
      if (neu === null || neu.startsWith("!")) return void dire(neu);
      const cm = view.editor.cm;
      if (cm && cm.dispatch) {
        let a = 0;
        while (a < old.length && old[a] === neu[a]) a++;
        let b = 0;
        while (b < old.length - a && b < neu.length - a && old[old.length - 1 - b] === neu[neu.length - 1 - b]) b++;
        const top = cm.scrollDOM.scrollTop;
        cm.dispatch({ changes: { from: a, to: old.length - b, insert: neu.slice(a, neu.length - b) }, scrollIntoView: false });
        requestAnimationFrame(() => (cm.scrollDOM.scrollTop = top));
      } else view.editor.setValue(neu);
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    let r0 = "";
    await this.app.vault.process(file, (t) => {
      const r = fn(t);
      r0 = r;
      return r === null || r.startsWith("!") ? t : r;
    });
    if (r0 === null || r0.startsWith("!")) dire(r0);
  }

  addPartieButton(cell, path) {
    if (cell.querySelector(":scope > .tableau-partie")) return;
    const btn = createEl("button", { cls: "tableau-copier tableau-partie clickable-icon", attr: { "aria-label": "Ajouter une partie", type: "button" } });
    setIcon(btn, "plus");
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const view = this.app.workspace.getLeavesOfType("markdown").map((l) => l.view)
        .find((v) => v instanceof MarkdownView && v.file && v.file.path === path && v.containerEl.contains(btn));
      const file = this.app.vault.getAbstractFileByPath(path);
      const src = view && view.getViewData ? view.getViewData() : file instanceof TFile ? await this.app.vault.read(file) : "";
      const presents = new Set(src.split(/\r?\n/).filter(isTitleLine).map(partieRang));
      const menu = new Menu();
      PARTIES.forEach((p, rang) => {
        if (presents.has(rang)) return;
        menu.addItem((it) => it.setTitle(partieTitre(p)).onClick(() => this.insererPartie(view, path, rang)));
      });
      menu.showAtMouseEvent(e);
    });
    cell.prepend(btn);
  }

  // Mode modification : par l'éditeur (annulable avec Ctrl+Z, sans saut d'écran) ; mode lecture : par le fichier
  async insererPartie(view, path, rang) {
    if (view && view.getMode() === "source" && view.editor) {
      const old = view.editor.getValue();
      const neu = ajouterPartie(old, rang);
      if (neu === null) return void new Notice("Partie déjà présente ou tableau introuvable");
      const cm = view.editor.cm;
      if (cm && cm.dispatch) {
        // Seul le passage modifié est remplacé
        let a = 0;
        while (a < old.length && old[a] === neu[a]) a++;
        let b = 0;
        while (b < old.length - a && old[old.length - 1 - b] === neu[neu.length - 1 - b]) b++;
        const top = cm.scrollDOM.scrollTop;
        cm.dispatch({ changes: { from: a, to: old.length - b, insert: neu.slice(a, neu.length - b) }, scrollIntoView: false });
        requestAnimationFrame(() => (cm.scrollDOM.scrollTop = top));
      } else view.editor.setValue(neu);
      return;
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return;
    let ok = false;
    await this.app.vault.process(file, (t) => {
      const r = ajouterPartie(t, rang);
      ok = r !== null;
      return ok ? r : t;
    });
    if (!ok) new Notice("Partie déjà présente ou tableau introuvable");
  }

  enhance(table, path) {
    table.dataset[DONE] = "1";
    this.garderPosition(table, "examens|" + path, false);
    table.classList.add("exam-filtrable");

    const bar = createDiv({ cls: "exam-filtre-barre" });
    table.parentElement.insertBefore(bar, table);

    const apply = () => {
      const rows = categorize(table);
      const cats = [...new Set(rows.map((r) => r.cat).filter(Boolean))];
      let chosen = this.choix.get(path) || "";
      if (!cats.includes(chosen)) chosen = cats[0] || "";
      bar.empty();
      for (const c of cats) {
        const b = bar.createEl("button", { cls: "exam-filtre-bouton", text: c, attr: { title: "N'afficher que " + c } });
        if (c === chosen) b.addClass("is-active");
        b.addEventListener("mousedown", (e) => e.preventDefault()); // ne pas déplacer le curseur de l'éditeur
        b.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.choix.set(path, c);
          apply();
        });
      }
      for (const { tr, cat } of rows) tr.style.display = !chosen || cat === chosen ? "" : "none";
      markLabelCells(table);
    };
    // Un tableau caché (l'autre mode de la note, onglet en arrière-plan) mesure 0 : on attend qu'il soit affiché
    const measure = () => {
      if (!table.isConnected || !table.offsetParent || !table.getClientRects().length) return;
      apply();
      table.dataset[MESURE] = "1";
      if (this.visibilite) this.visibilite.unobserve(table);
    };
    this.mesures.set(table, measure);
    apply();
    measure();
    if (!table.dataset[MESURE] && this.visibilite) this.visibilite.observe(table);
  }
};

module.exports._test = { jourSemaine, ajouterColonne, ajouterPartie, partieRang, dayText, bioText, traitement, withUnit, unitOf, dateOf };

  return module.exports;
})();

// ===== Bouton Replier tout en haut à droite des notes (src/replier.js) =====
const module_replier = (function () {
  const module = { exports: {} };
const { MarkdownView, Plugin, setIcon } = require("obsidian");

// Bouton en haut à droite de chaque note : replier tout / déplier tout (titres seulement, pas les puces).

const CLS = "outils-replier";

module.exports = class ReplierPlugin extends Plugin {
  onload() {
    const addAll = () =>
      this.app.workspace.getLeavesOfType("markdown").forEach((leaf) => {
        if (leaf.view instanceof MarkdownView) this.addButton(leaf.view);
      });
    this.app.workspace.onLayoutReady(addAll);
    this.registerEvent(this.app.workspace.on("layout-change", addAll));
    this.registerEvent(this.app.workspace.on("active-leaf-change", addAll));
    this.garderPositionEntreModes();
  }

  // Passage lecture <-> modification : Obsidian perd la position sur les notes à gros tableaux
  // (de la ligne 27 en lecture à la ligne 3 en modification, constaté même sans ce plugin).
  // On retient la ligne affichée dans chaque mode, et après un changement de mode on y ramène la note.
  garderPositionEntreModes() {
    const etat = new WeakMap(); // vue -> { mode, ligne, retour }
    const vueDe = (el) =>
      this.app.workspace.getLeavesOfType("markdown").map((l) => l.view)
        .find((v) => v instanceof MarkdownView && v.containerEl.contains(el));
    const ramener = (v, s) => {
      s.retour = performance.now() + 900; // pendant ce temps, les défilements d'Obsidian ne remplacent pas la ligne retenue
      const mode = s.mode;
      const ligne = s.ligne;
      const appliquer = () => {
        if (performance.now() > s.retour || v.getMode() !== mode) return; // l'utilisateur a repris la main
        if (v.currentMode && v.currentMode.applyScroll) v.currentMode.applyScroll(ligne);
      };
      for (const t of [0, 60, 200, 450, 800]) setTimeout(appliquer, t);
    };
    // Molette, clavier ou clic de l'utilisateur : on arrête aussitôt de ramener la note
    const reprise = () => {
      for (const l of this.app.workspace.getLeavesOfType("markdown")) {
        const s = etat.get(l.view);
        if (s) s.retour = 0;
      }
    };
    for (const type of ["wheel", "keydown", "pointerdown"]) this.registerDomEvent(document, type, reprise, { capture: true, passive: true });
    const verifier = (v) => {
      if (!(v instanceof MarkdownView) || !v.currentMode || !v.currentMode.getScroll) return;
      const mode = v.getMode();
      const fichier = v.file ? v.file.path : "";
      const s = etat.get(v);
      // Première fois, ou autre note ouverte dans le même onglet : on repart de la position actuelle
      if (!s || s.fichier !== fichier) return void etat.set(v, { mode, fichier, ligne: v.currentMode.getScroll(), retour: 0 });
      if (s.mode !== mode) {
        // Changement de mode : on garde la ligne d'avant et on y ramène la note
        s.mode = mode;
        ramener(v, s);
        return;
      }
      if (performance.now() > s.retour) s.ligne = v.currentMode.getScroll();
    };
    let attente = false;
    this.registerDomEvent(document, "scroll", (e) => {
      if (attente || !(e.target instanceof Element)) return;
      attente = true;
      requestAnimationFrame(() => {
        attente = false;
        const v = vueDe(e.target);
        if (v) verifier(v);
      });
    }, { capture: true, passive: true });
    // Changement de mode sans défilement : repéré au changement de disposition
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      for (const l of this.app.workspace.getLeavesOfType("markdown")) verifier(l.view);
    }));
  }

  onunload() {
    document.querySelectorAll("." + CLS).forEach((b) => b.remove());
  }

  addButton(view) {
    if (view.containerEl.querySelector("." + CLS)) return;
    const btn = view.addAction("chevrons-down-up", "Replier tout", () => {
      const replie = !btn.hasClass("is-replie");
      this.toggle(view, replie);
      btn.toggleClass("is-replie", replie);
      setIcon(btn, replie ? "chevrons-up-down" : "chevrons-down-up");
      btn.setAttr("aria-label", replie ? "Déplier tout" : "Replier tout");
    });
    btn.addClass(CLS);
  }

  toggle(view, replie) {
    // État de repli de la note (le même pour les deux modes) : un repli par titre, calculé sur tout le texte,
    // y compris la fin de la note qu'Obsidian n'a pas encore analysée ou affichée
    const mode = view.currentMode;
    if (mode && mode.applyFoldInfo && view.editor) {
      const lines = view.getViewData().split("\n"); // pas l'éditeur : périmé en mode lecture après une modification venue d'ailleurs
      const info = { folds: replie ? headingFolds(lines) : [], lines: lines.length };
      mode.applyFoldInfo(info);
      if (this.app.foldManager && view.file) this.app.foldManager.save(view.file, info);
      return;
    }
    this.app.commands.executeCommandById(replie ? "editor:fold-all" : "editor:unfold-all");
  }
};

// Chaque titre replié jusqu'à la dernière ligne non vide avant le titre suivant de même niveau ou plus haut
function headingFolds(lines) {
  const heads = [];
  let fence = false;
  lines.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    const m = !fence && l.match(/^(#{1,6})\s/);
    if (m) heads.push({ line: i, level: m[1].length });
  });
  const folds = [];
  heads.forEach((h, k) => {
    const next = heads.slice(k + 1).find((x) => x.level <= h.level);
    let end = (next ? next.line : lines.length) - 1;
    while (end > h.line && !lines[end].trim()) end--;
    if (end > h.line) folds.push({ from: h.line, to: end });
  });
  return folds;
}

module.exports._test = { headingFolds };

  return module.exports;
})();

// ===== Pastilles rouges sur les lignes importantes (src/pastilles.js) =====
const module_pastilles = (function () {
  const module = { exports: {} };
const { MarkdownView, Notice, Plugin, TFile } = require("obsidian");

// Pastilles rouges pour mettre une ligne en valeur, sans rien taper :
// - une pastille grise, invisible tant qu'on ne survole pas la ligne, est posée d'avance à gauche de chaque puce et
//   de chaque ligne de tableau : le survol (marge de gauche comprise) l'affiche aussitôt, sans calcul ;
// - un clic l'allume en rouge, un clic sur la pastille rouge l'éteint ;
// - aussi par le clic droit (« Marquer important ») et par une commande (raccourci au choix dans les réglages).
// Dans la note : « - [!] texte » pour une puce (case spéciale d'Obsidian, affichée en pastille rouge),
// « <span class="pastille"></span> » au début de la première case pour une ligne de tableau (petite pastille rouge
// à gauche, rien d'autre). Les boutons Copier et le tri l'ignorent.

const MARQUE = '<span class="pastille"></span>';
const MARQUE_RE = /<span class="pastille"><\/span>\s*/g;
const PUCE = /^(\s*(?:>\s*)*[-*+]\s+)(\[(.)\]\s+)?/;

// Nouvelle ligne avec la pastille ajoutée ou retirée, ou null si la ligne ne s'y prête pas
function basculerLigne(line) {
  const m = line.match(PUCE);
  if (m) {
    if (m[2] && m[3] === "!") return m[1] + line.slice(m[0].length); // pastille retirée
    if (m[2]) return null; // vraie case à cocher : on n'y touche pas
    return m[1] + "[!] " + line.slice(m[0].length);
  }
  const t = line.match(/^(\s*(?:>\s*)*\|)([^|]*)(\|.*)$/);
  if (!t) return null;
  const cell = t[2];
  const contenu = cell.replace(MARQUE_RE, "").replace(/\s*🔴/g, "").trim();
  // Séparateur, case fusionnée, ligne titre, ligne d'examen (bouton émoji), case vide : pas de pastille
  if (/^:?-+:?$/.test(contenu) || contenu === "^" || contenu === "<" || /data-exam-emoji-picker/.test(cell)) return null;
  if (/^\s*\|\s*<\s*\|/.test(t[3]) || !contenu) return null;
  // Déjà marquée (balise, ou ancien 🔴) : on retire ; sinon on met la balise au début de la case
  if (cell.includes(MARQUE) || cell.includes("🔴")) {
    return t[1] + cell.replace(MARQUE_RE, "").replace(/\s*🔴/g, "") + t[3];
  }
  return t[1] + cell.replace(/^(\s*)/, "$1" + MARQUE) + t[3];
}

const estMarque = (line) => {
  const m = line.match(PUCE);
  if (m) return !!(m[2] && m[3] === "!");
  const t = line.match(/^\s*(?:>\s*)*\|([^|]*)\|/);
  return !!t && (t[1].includes(MARQUE) || t[1].includes("🔴"));
};

// ---------- Ligne de la note qui correspond à la ligne cliquée ----------
// Le rang de la ligne affichée ne suffit pas : sur un PC du travail, le clic marquait la ligne du dessous
// (rangée de plus dans le tableau affiché), et l'affichage immédiat cachait l'erreur jusqu'au tri suivant.
// La ligne choisie doit donc avoir le même texte que la ligne cliquée ; sinon on prend la ligne de même texte
// la plus proche, et à défaut on ne marque rien.

const LIGNE_TABLEAU = /^\s*(?:>\s*)*\|/;
const ENTITES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };
// Lettres et chiffres seulement : la source (markdown, balises, liens) et l'affichage deviennent comparables
const comparable = (s) =>
  (s || "")
    .replace(MARQUE_RE, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/gi, (m, e) => ENTITES[e.toLowerCase()])
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

// Texte d'une ligne de la note : première case d'une ligne de tableau, texte d'une puce (sans « - » ni case)
function texteSource(line) {
  if (LIGNE_TABLEAU.test(line)) {
    const t = line.match(/^\s*(?:>\s*)*\|((?:\\\||[^|])*)/);
    return comparable(t ? t[1] : "");
  }
  const m = line.match(PUCE);
  return comparable(m ? line.slice(m[0].length) : line);
}

// Ligne de même texte que la ligne cliquée : le rang calculé s'il convient, sinon la plus proche de lui ; -1 si aucune
function trouverLigne(lines, candidat, voulu, tableau) {
  if (!voulu) return -1;
  const ok = (i) => {
    const l = lines[i];
    if (l === undefined || !(tableau ? LIGNE_TABLEAU.test(l) : PUCE.test(l))) return false;
    return texteSource(l) === voulu;
  };
  if (ok(candidat)) return candidat;
  let best = -1;
  for (let i = 0; i < lines.length; i++) {
    if (ok(i) && (best < 0 || Math.abs(i - candidat) < Math.abs(best - candidat))) best = i;
  }
  return best;
}

// Texte affiché de la ligne cliquée (première case d'une ligne de tableau, texte propre d'une puce)
function texteAffiche(el) {
  const src = el.tagName === "TR" ? el.cells[0] : el;
  if (!src) return "";
  const c = src.cloneNode(true);
  const retirer = ".pastille-fantome, .pastille, button, input, .jour-semaine, .table-row-drag-handle, .table-col-drag-handle, .list-collapse-indicator, .collapse-indicator";
  c.querySelectorAll(el.tagName === "TR" ? retirer : retirer + ", ul, ol").forEach((x) => x.remove());
  return comparable(c.textContent);
}

const nouvelleFantome = () => createSpan({ cls: "pastille-fantome", attr: { "aria-label": "Marquer important" } });

module.exports = class PastillesPlugin extends Plugin {
  onload() {
    // Mode lecture : bloc affiché -> son contexte, pour relire sa place dans la note au moment du clic
    // (des lignes ajoutées plus haut décalent la note sans que le bloc soit redessiné)
    this.sections = new WeakMap();
    this.registerMarkdownPostProcessor((el, ctx) => {
      this.sections.set(el, ctx);
    });

    // Pastilles grises posées d'avance (puces du mode lecture, lignes de tableau des deux modes)
    let attente = false;
    const poser = () => {
      attente = false;
      for (const li of this.app.workspace.containerEl.querySelectorAll(".markdown-reading-view li")) {
        if (li.closest("table") || (li.dataset.task && li.dataset.task !== "!")) continue;
        if (li.dataset.task === "!") continue; // la case rouge sert déjà de pastille
        if (!li.querySelector(":scope > .pastille-fantome")) li.prepend(nouvelleFantome());
      }
      for (const tr of this.app.workspace.containerEl.querySelectorAll(".workspace-leaf-content[data-type='markdown'] table tbody tr")) {
        const c = tr.cells[0];
        if (!c || !this.ligneTableauPossible(tr)) continue;
        if (c.querySelector(".pastille")) {
          const f = c.querySelector(":scope > .pastille-fantome");
          if (f) f.remove();
        } else if (!c.querySelector(":scope > .pastille-fantome")) c.prepend(nouvelleFantome());
      }
    };
    const obs = new MutationObserver(() => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(poser);
    });
    obs.observe(this.app.workspace.containerEl, { childList: true, subtree: true });
    this.register(() => obs.disconnect());
    this.app.workspace.onLayoutReady(poser);
    this.register(() => document.querySelectorAll(".pastille-fantome").forEach((f) => f.remove()));

    // Mode modification, puces : l'éditeur gère lui-même ses lignes, on y affiche une pastille flottante
    this.flottante = document.body.createDiv({ cls: "pastille-fantome pastille-flottante" });
    this.register(() => this.flottante.remove());
    let cible = null;
    let cacher = null;
    let suivi = null;
    const placer = (ligne) => {
      if (ligne === cible && this.flottante.style.display === "block") return;
      cible = ligne;
      const puce = ligne.querySelector(".list-bullet") || ligne;
      const r = puce.getBoundingClientRect();
      const h = ligne.getBoundingClientRect();
      this.flottante.style.top = h.top + Math.min(h.height, 26) / 2 - 5 + "px";
      this.flottante.style.left = r.left - 18 + "px";
      this.flottante.style.display = "block";
    };
    this.registerDomEvent(document, "mousemove", (e) => {
      suivi = e;
      if (this.suiviPrevu) return;
      this.suiviPrevu = true;
      requestAnimationFrame(() => {
        this.suiviPrevu = false;
        const ev = suivi;
        if (!ev || ev.target === this.flottante) return void clearTimeout(cacher);
        const ligne = this.ligneEditeurSous(ev);
        if (ligne) {
          clearTimeout(cacher);
          return void placer(ligne);
        }
        clearTimeout(cacher);
        cacher = setTimeout(() => {
          this.flottante.style.display = "none";
          cible = null;
        }, 300);
      });
    }, { passive: true });

    // Clics : pastille grise (allume), pastille rouge (éteint), case rouge d'une puce « [!] » (éteint).
    // Interceptés dès la fenêtre : sinon le tableau du mode modification passe en édition de la case.
    const surClic = (e) => {
      if (!(e.target instanceof Element)) return;
      let el = null;
      if (e.target === this.flottante) el = cible;
      else if (e.target.closest(".pastille-fantome, .pastille")) el = e.target.closest("li, tr, .cm-line");
      else {
        const box = e.target.closest("input.task-list-item-checkbox");
        if (box) el = box.closest('li[data-task="!"], .HyperMD-task-line[data-task="!"]');
      }
      if (!el) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === "click") this.basculerElement(el);
    };
    for (const type of ["pointerdown", "mousedown", "click"]) this.registerDomEvent(window, type, surClic, { capture: true });

    // Commande (raccourci au choix dans Réglages > Raccourcis) et clic droit, sur la ligne du curseur
    this.addCommand({
      id: "pastille",
      name: "Marquer / démarquer la ligne comme importante",
      editorCallback: (editor) => this.basculerEditeur(editor, editor.getCursor().line),
    });
    this.registerEvent(this.app.workspace.on("editor-menu", (menu, editor) => {
      const n = editor.getCursor().line;
      const l = editor.getLine(n);
      if (basculerLigne(l) === null) return;
      menu.addItem((it) => it.setTitle(estMarque(l) ? "Retirer la pastille" : "Marquer important").setIcon("circle-dot")
        .onClick(() => this.basculerEditeur(editor, n)));
    }));
  }

  // Ligne de tableau qui peut recevoir une pastille : pas l'en-tête, pas une ligne titre fusionnée,
  // pas une ligne du tableau des examens, pas une ligne dont la première case est fusionnée avec celle du dessus
  ligneTableauPossible(tr) {
    if (tr.closest("thead") || tr.querySelector(".exam-emoji-inline-picker") || tr.closest("table.exam-filtrable")) return false;
    const c = tr.cells[0];
    if (!c || c.colSpan > 1) return false;
    const txt = (c.textContent || "").trim();
    if (!txt || txt === "^" || txt === "<" || c.style.display === "none") return false;
    // Première colonne fusionnée sur plusieurs lignes (« ^ ») : les lignes couvertes n'ont pas leur propre première case
    const rows = tr.closest("table").rows;
    for (let i = tr.rowIndex - 1; i >= 0; i--) {
      const c0 = rows[i].cells[0];
      if (c0 && c0.rowSpan > 1 && i + c0.rowSpan > tr.rowIndex) return false;
    }
    return true;
  }

  // Puce du mode modification sous la souris (marge de gauche comprise), ou null
  ligneEditeurSous(e) {
    const t = e.target;
    if (!(t instanceof Element) || !t.closest(".markdown-source-view")) return null;
    const ok = (el) => el && !el.classList.contains("HyperMD-task-line") ? el : null;
    const direct = t.closest(".cm-line.HyperMD-list-line");
    if (direct) return ok(direct);
    if (!t.closest(".cm-scroller")) return null;
    // Souris dans la marge de gauche : on cherche la ligne un peu plus à droite, à la même hauteur
    for (const dx of [20, 45, 70]) {
      const sous = document.elementFromPoint(e.clientX + dx, e.clientY);
      const l = sous && sous.closest(".cm-line.HyperMD-list-line");
      if (l) return ok(l);
    }
    return null;
  }

  // Place de la ligne cliquée dans la note : { view, path, candidat (rang calculé), voulu (texte affiché, à vérifier),
  // tableau }, ou { exact } pour une ligne de l'éditeur, dont la position est donnée par l'éditeur lui-même
  localiser(el) {
    const view = this.app.workspace.getLeavesOfType("markdown").map((l) => l.view)
      .find((v) => v instanceof MarkdownView && v.containerEl.contains(el));
    if (!view || !view.file) return null;
    const tableau = el.tagName === "TR";
    // Rang parmi les lignes de données (corps du tableau) : une rangée d'en-tête en plus ne décale rien
    const rangDonnee = () => (el.parentElement && el.parentElement.tagName === "TBODY" ? [...el.parentElement.rows].indexOf(el) : el.rowIndex - 1);
    try {
      // Mode modification
      const cm = view.editor && view.editor.cm;
      if (cm && el.closest(".cm-editor")) {
        const lines = cm.state.doc.toString().split("\n");
        if (!tableau) return { view, path: view.file.path, exact: cm.state.doc.lineAt(cm.posAtDOM(el)).number - 1 };
        const widget = el.closest(".cm-table-widget");
        if (!widget) return null;
        let h = cm.state.doc.lineAt(cm.posAtDOM(widget)).number - 1;
        if (!LIGNE_TABLEAU.test(lines[h] || "") && LIGNE_TABLEAU.test(lines[h + 1] || "")) h++; // ligne d'avant le tableau
        while (h > 0 && LIGNE_TABLEAU.test(lines[h - 1])) h--; // jusqu'à l'en-tête
        return { view, path: view.file.path, candidat: h + 2 + rangDonnee(), voulu: texteAffiche(el), tableau };
      }
      // Mode lecture : bloc affiché qui contient la ligne, et sa place dans la note relue maintenant
      let sec = el;
      while (sec && !this.sections.has(sec)) sec = sec.parentElement;
      if (!sec) return null;
      const ctx = this.sections.get(sec);
      const info = ctx.getSectionInfo(sec);
      if (!info) return null;
      const lines = info.text.split(/\r?\n/);
      let candidat = -1;
      if (tableau) {
        for (let i = info.lineStart; i <= info.lineEnd; i++) if (LIGNE_TABLEAU.test(lines[i] || "")) { candidat = i + 2 + rangDonnee(); break; }
      } else {
        const puces = [];
        for (let i = info.lineStart; i <= info.lineEnd; i++) if (PUCE.test(lines[i] || "")) puces.push(i);
        const k = [...sec.querySelectorAll("li")].indexOf(el);
        if (k >= 0 && puces[k] !== undefined) candidat = puces[k];
      }
      return { view, path: ctx.sourcePath, candidat, voulu: texteAffiche(el), tableau, lines };
    } catch (e) {
      console.error("Outils hospit, pastilles", e);
      return null;
    }
  }

  // Ligne à basculer dans ce texte de la note, ou -1
  ligneDans(pos, lines) {
    if (pos.exact !== undefined) return pos.exact;
    return trouverLigne(lines, pos.candidat, pos.voulu, pos.tableau);
  }

  // Mode lecture : affichage immédiat, sans attendre qu'Obsidian redessine la note (la ligne a déjà été vérifiée)
  afficher(el, allumer) {
    if (el.tagName === "TR") {
      const c = el.cells[0];
      if (!c) return;
      c.querySelectorAll(":scope > .pastille-fantome").forEach((f) => f.remove());
      c.querySelectorAll(".pastille").forEach((p) => p.remove());
      c.prepend(allumer ? createSpan({ cls: "pastille" }) : nouvelleFantome());
    } else {
      el.classList.toggle("pastille-on", allumer);
      el.classList.toggle("pastille-off", !allumer);
    }
  }

  async basculerElement(el) {
    this.flottante.style.display = "none";
    const pos = this.localiser(el);
    const introuvable = () => new Notice("Ligne introuvable dans la note : rien n'a été marqué");
    if (!pos) return void introuvable();
    // Mode modification : par l'éditeur (immédiat, annulable) ; l'éditeur redessine lui-même la ligne
    if (pos.view.getMode() === "source" && pos.view.editor && el.closest(".cm-editor")) {
      const n = this.ligneDans(pos, pos.view.editor.getValue().split("\n"));
      if (n < 0) return void introuvable();
      return void this.basculerEditeur(pos.view.editor, n);
    }
    // Mode lecture : par le fichier (l'éditeur caché du mode lecture n'enregistre pas ses changements)
    const n = this.ligneDans(pos, pos.lines);
    if (n < 0) return void introuvable();
    this.afficher(el, !estMarque(pos.lines[n]));
    const file = this.app.vault.getAbstractFileByPath(pos.path);
    if (!(file instanceof TFile)) return;
    let ok = false;
    await this.app.vault.process(file, (text) => {
      const nl = text.includes("\r\n") ? "\r\n" : "\n";
      const ls = text.split(/\r?\n/);
      // Ligne recherchée de nouveau dans le fichier tel qu'il est au moment d'écrire
      const k = this.ligneDans({ ...pos, candidat: n }, ls);
      const neu = k < 0 ? null : basculerLigne(ls[k]);
      if (neu === null) return text;
      ls[k] = neu;
      ok = true;
      return ls.join(nl);
    });
    if (!ok) {
      new Notice("Pas de pastille possible sur cette ligne");
      if (pos.view.previewMode) pos.view.previewMode.rerender(true); // efface l'affichage immédiat
    }
  }

  basculerEditeur(editor, n) {
    const l = editor.getLine(n);
    const neu = l === undefined ? null : basculerLigne(l);
    if (neu === null) return void new Notice("Pas de pastille possible sur cette ligne");
    const cm = editor.cm;
    if (cm && cm.dispatch) {
      const line = cm.state.doc.line(n + 1);
      const top = cm.scrollDOM.scrollTop;
      cm.dispatch({ changes: { from: line.from, to: line.to, insert: neu }, scrollIntoView: false });
      requestAnimationFrame(() => (cm.scrollDOM.scrollTop = top));
    } else editor.setLine(n, neu);
  }
};

module.exports._test = { basculerLigne, estMarque, comparable, texteSource, trouverLigne };

  return module.exports;
})();

// ===== Tableau des examens : valeurs basses en bleu, hautes en rouge (src/couleurs.js) =====
const module_couleurs = (function () {
  const module = { exports: {} };
const { Plugin, TFile } = require("obsidian");

// Tableau des examens : valeurs sous la norme en bleu, au-dessus en rouge (affichage seulement : rien n'est écrit
// dans les notes, les copies ne changent pas).
// Les normes viennent de la note « Générateur/Normes biologiques » (modifiable, relue à chaque changement) ;
// sans cette note, celles de NORMES_DEFAUT ci-dessous.
// Homme ou femme : lu dans la Synthèse de la note (« homme », « femme »). Inconnu : on ne colore que ce qui est
// anormal pour les deux sexes.

const CHEMIN_NORMES = "Générateur/Normes biologiques.md";

const NORMES_DEFAUT = `Normes utilisées par le plugin Outils hospit pour colorer le tableau des examens : en bleu sous le minimum, en rouge au-dessus du maximum. Adultes, valeurs usuelles : à adapter aux normes de votre laboratoire, le plugin relit cette note à chaque modification.

- Case vide : pas de limite de ce côté.
- Plusieurs noms pour une même analyse : séparés par « / ».
- Colonnes « femme » : utilisées quand la Synthèse de la note dit « femme » ; colonnes Min et Max quand elle dit « homme ». Sans l'un ou l'autre, seules les valeurs anormales pour les deux sexes sont colorées.
- Unité : une valeur notée avec une autre unité dans le tableau des examens, « Fer (mg/L) » par exemple, n'est pas colorée.

| Analyse | Min | Max | Min femme | Max femme | Unité |
| --- | --- | --- | --- | --- | --- |
| Hb / Hémoglobine | 13 | 17 | 12 | 16 | g/dL |
| GB / Leucocytes | 4 | 10 |  |  | G/L |
| PNN / Neutrophiles | 1.5 | 7 |  |  | G/L |
| Lymphocytes | 1 | 4 |  |  | G/L |
| Monocytes | 0.2 | 1 |  |  | G/L |
| Éosinophiles | | 0.5 |  |  | G/L |
| Basophiles | | 0.1 |  |  | G/L |
| Plaquettes | 150 | 400 |  |  | G/L |
| VGM | 80 | 100 |  |  | fL |
| TCMH | 27 | 32 |  |  | pg |
| CCMH | 32 | 36 |  |  | g/dL |
| Réticulocytes | 20 | 120 |  |  | G/L |
| Hématocrite / Ht | 40 | 52 | 37 | 47 | % |
| TP | 70 | |  |  | % |
| FII / FV / FVII / FX | 70 | |  |  | % |
| TCA | | 1.2 |  |  |  |
| Fibrinogène | 2 | 4 |  |  | g/L |
| D-dimères | | 500 |  |  | ng/mL |
| Na | 135 | 145 |  |  | mmol/L |
| K | 3.5 | 5 |  |  | mmol/L |
| Cl / Chlore | 98 | 107 |  |  | mmol/L |
| Bicarbonates / HCO3 / Réserve alcaline | 22 | 29 |  |  | mmol/L |
| Créatinine | 60 | 110 | 45 | 90 | µmol/L |
| Urée | 2.5 | 7.5 |  |  | mmol/L |
| DFG | 60 | |  |  | mL/min/1,73 m² |
| Calcium / Calcémie / Calcium corrigé | 2.2 | 2.6 |  |  | mmol/L |
| Phosphore | 0.8 | 1.45 |  |  | mmol/L |
| Mg / Magnésium | 0.7 | 1.05 |  |  | mmol/L |
| Osmolarité / Osmolalité | 280 | 300 |  |  | mOsm/kg |
| Glycémie | 0.7 | 1.1 |  |  | g/L |
| HbA1c | | 6 |  |  | % |
| CRP | | 5 |  |  | mg/L |
| PCT / Procalcitonine | | 0.5 |  |  | µg/L |
| ASAT | | 40 |  |  | UI/L |
| ALAT | | 45 |  | 35 | UI/L |
| GGT | | 60 |  | 40 | UI/L |
| PAL | 40 | 130 |  |  | UI/L |
| Bilirubine / Bilirubine totale | | 21 |  |  | µmol/L |
| Lipase | | 60 |  |  | UI/L |
| LDH | | 250 |  |  | UI/L |
| CPK | | 190 |  | 170 | UI/L |
| Albumine | 35 | 50 |  |  | g/L |
| Protéines / Protidémie | 60 | 80 |  |  | g/L |
| Préalbumine | 0.2 | 0.4 |  |  | g/L |
| Ferritine | 30 | 300 | 15 | 150 | µg/L |
| Fer | 10 | 30 |  |  | µmol/L |
| Transferrine | 2 | 3.6 |  |  | g/L |
| CST | 20 | 40 |  |  | % |
| Haptoglobine | 0.3 | 2 |  |  | g/L |
| Acide urique / Uricémie | 150 | 420 | 140 | 340 | µmol/L |
| B12 | 150 | 650 |  |  | pmol/L |
| B9 / Folates | 4 | |  |  | ng/mL |
| Vitamine D / 25-OH vitamine D | 75 | |  |  | nmol/L |
| TSH | 0.4 | 4 |  |  | mUI/L |
| T4L / T4 | 12 | 22 |  |  | pmol/L |
| BNP | | 100 |  |  | ng/L |
| NT-proBNP | | 450 |  |  | ng/L |
| Lactates | | 2 |  |  | mmol/L |
| Ammonium / Ammoniémie | | 50 |  |  | µmol/L |
| pH | 7.35 | 7.45 |  |  |  |
| pCO2 / PaCO2 | 35 | 45 |  |  | mmHg |
| pO2 / PaO2 | 80 | |  |  | mmHg |
| Cholestérol total | | 2 |  |  | g/L |
| HDL | 0.4 | | 0.5 |  | g/L |
| Triglycérides | | 1.5 |  |  | g/L |
| PSA | | 4 |  |  | ng/mL |
| IgG | 7 | 16 |  |  | g/L |
| IgA | 0.7 | 4 |  |  | g/L |
| IgM | 0.4 | 2.3 |  |  | g/L |
`;

// « Pré albumine », « Préalbumine », « PREALBUMINE » : même analyse
const cle = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const cleUnite = (s) => (s || "").toLowerCase().replace(/\s/g, "").replace(/µ/g, "u");
const nombre = (s) => {
  const t = (s || "").trim().replace(",", ".");
  return t === "" || isNaN(+t) ? null : +t;
};

// Tableau de la note des normes -> Map(clé du nom -> { min, max, minF, maxF, unite })
function lireNormes(md) {
  const normes = new Map();
  const ls = md.split(/\r?\n/).filter((l) => /^\s*\|/.test(l));
  const cells = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const h = ls.findIndex((l) => cells(l).some((c) => /^analyse$/i.test(c)));
  if (h < 0) return normes;
  const head = cells(ls[h]).map((c) => cle(c));
  const col = (n) => head.indexOf(n);
  const [iA, iMin, iMax, iMinF, iMaxF, iU] = ["analyse", "min", "max", "minfemme", "maxfemme", "unite"].map(col);
  for (const l of ls.slice(h + 1)) {
    if (/^\s*\|[\s|:-]+\|\s*$/.test(l)) continue;
    const c = cells(l);
    const n = { min: nombre(c[iMin]), max: nombre(c[iMax]), minF: nombre(c[iMinF]), maxF: nombre(c[iMaxF]), unite: iU >= 0 ? c[iU] || "" : "" };
    for (const nom of (c[iA] || "").split("/")) if (cle(nom)) normes.set(cle(nom), n);
  }
  return normes;
}

// Bornes selon le sexe : « H », « F », ou inconnu (seules les valeurs anormales pour les deux sexes)
function bornes(n, sexe) {
  const minF = n.minF ?? n.min, maxF = n.maxF ?? n.max;
  if (sexe === "F") return [minF, maxF];
  if (sexe === "H") return [n.min, n.max];
  const min = n.min === null ? minF : minF === null ? n.min : Math.min(n.min, minF);
  const max = n.max === null ? maxF : maxF === null ? n.max : Math.max(n.max, maxF);
  return [min, max];
}

// Valeur d'une case : « bas », « haut » ou "" ; « <1.1 » et « >90 » comptent comme des bornes, pas des valeurs exactes
function niveau(texte, min, max) {
  const m = (texte || "").trim().match(/^([<>≤≥])?\s*(-?\d+(?:[.,]\d+)?)/);
  if (!m) return "";
  const v = +m[2].replace(",", ".");
  const signe = m[1] || "";
  if (min !== null && (signe === "<" || signe === "≤" ? v <= min : signe === "" && v < min)) return "bas";
  if (max !== null && (signe === ">" || signe === "≥" ? v >= max : signe === "" && v > max)) return "haut";
  return "";
}

// Sexe écrit dans la Synthèse (avant le titre suivant) : « femme », « patiente », « Madame » / « homme », « Monsieur »
function sexeDeLaNote(text) {
  const ls = text.split(/\r?\n/);
  const h = ls.findIndex((l) => /^#{1,6}\s.*Synth[eè]se/i.test(l));
  if (h < 0) return "";
  const fin = ls.findIndex((l, i) => i > h && /^#{1,6}\s/.test(l));
  const s = ls.slice(h + 1, fin < 0 ? ls.length : fin).join(" ");
  if (/\b(femme|patiente|madame|mme)\b/i.test(s)) return "F";
  if (/\b(homme|monsieur)\b/i.test(s)) return "H";
  return "";
}

// Microbiologie (☣️) et prélèvements (🫙) : résultat positif ? D'après le texte de la case :
// « positif », un « + » (covid+, ++), « présence », ou un germe nommé sans négation. Pas « négatif », « stérile »…
const NEGATION = /\bneg|negati|absen|sterile|pas de|aucun/;
const POSITIF = /positi|presence|\+/;
const GERME = /e\.? ?coli|escherichia|staph|strepto|pneumocoque|klebsiella|pseudomonas|enterocoque|enterobact|proteus|serratia|candida|aspergill|bgn|cgp|bacille|legionell|clostridi|covid|sars|grippe|influenza|vrs/;
function positif(texte) {
  const s = (texte || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (!s.trim() || /en cours/.test(s)) return false;
  if (POSITIF.test(s)) return true;
  return GERME.test(s) && !NEGATION.test(s);
}
const CATEGORIES_MICRO = ["☣", "\u{1FAD9}"]; // ☣️ microbiologie, 🫙 prélèvement

module.exports = class CouleursPlugin extends Plugin {
  onload() {
    this.normes = lireNormes(NORMES_DEFAUT);
    this.sexes = new Map(); // chemin -> "H" | "F" | ""
    const chargerNormes = async () => {
      const f = this.app.vault.getAbstractFileByPath(CHEMIN_NORMES);
      this.normes = lireNormes(f instanceof TFile ? await this.app.vault.cachedRead(f) : NORMES_DEFAUT);
      this.toutColorer(true);
    };
    const changement = async (file) => {
      if (!(file instanceof TFile)) return;
      if (file.path === CHEMIN_NORMES) return void chargerNormes();
      if (this.sexes.has(file.path)) {
        const avant = this.sexes.get(file.path);
        this.sexes.set(file.path, sexeDeLaNote(await this.app.vault.cachedRead(file)));
        if (avant !== this.sexes.get(file.path)) this.toutColorer(true);
      }
    };
    this.registerEvent(this.app.vault.on("modify", changement));
    this.registerEvent(this.app.vault.on("create", changement));
    this.registerEvent(this.app.vault.on("rename", (file) => file.path === CHEMIN_NORMES && chargerNormes()));
    this.app.workspace.onLayoutReady(chargerNormes);

    let attente = false;
    const obs = new MutationObserver(() => {
      if (attente) return;
      attente = true;
      requestAnimationFrame(() => {
        attente = false;
        this.toutColorer(false);
      });
    });
    obs.observe(this.app.workspace.containerEl, { childList: true, subtree: true, characterData: true });
    this.register(() => obs.disconnect());
    this.register(() => document.querySelectorAll(".bio-bas, .bio-haut").forEach((c) => c.classList.remove("bio-bas", "bio-haut")));
  }

  sexeDe(path) {
    if (this.sexes.has(path)) return this.sexes.get(path);
    this.sexes.set(path, "");
    const f = this.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) this.app.vault.cachedRead(f).then((t) => {
      const s = sexeDeLaNote(t);
      if (s) {
        this.sexes.set(path, s);
        this.toutColorer(true);
      }
    });
    return "";
  }

  toutColorer(force) {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const v = leaf.view;
      if (!v || !v.file || !v.containerEl) return;
      for (const table of v.containerEl.querySelectorAll("table")) this.colorer(table, v.file.path, force);
    });
  }

  // Tableau des examens : en-tête avec une case « Examen » ; valeurs dans les colonnes à sa droite
  colorer(table, path) {
    const head = table.querySelector("thead tr") || table.rows[0];
    if (!head) return;
    const hc = [...head.cells];
    const ex = hc.findIndex((c) => (c.textContent || "").trim() === "Examen");
    if (ex < 0) return;
    const sexe = this.sexeDe(path);
    const full = hc.reduce((s, c) => s + (c.colSpan || 1), 0);
    let cat = ""; // catégorie de la ligne : premier émoji trouvé, sinon celle du dessus (cases fusionnées)
    for (const tr of table.querySelectorAll("tbody tr")) {
      const cells = [...tr.cells];
      // Lignes dont la 1re case est fusionnée avec celle du dessus : il leur manque des cases à gauche
      const manque = full - cells.reduce((s, c) => s + (c.colSpan || 1), 0);
      const i = ex - Math.max(0, manque);
      // Émoji cherché dans le bouton et le nom seulement, pas dans les valeurs (🕐 en attente)
      for (const c of cells.slice(0, i + 1)) {
        const e = (c.textContent || "").match(/\p{Extended_Pictographic}/u);
        if (e) {
          cat = e[0];
          break;
        }
      }
      const micro = CATEGORIES_MICRO.includes(cat);
      const brut = (cells[i] && cells[i].textContent) || "";
      let nom = brut.replace(/[\p{Extended_Pictographic}️]/gu, "").trim();
      let unite = "";
      const m = nom.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
      if (m) [nom, unite] = [m[1], m[2]];
      const n = this.normes.get(cle(nom));
      const ok = n && !(unite && n.unite && cleUnite(unite) !== cleUnite(n.unite));
      const [min, max] = ok ? bornes(n, sexe) : [null, null];
      cells.forEach((c, j) => {
        const v = j <= i ? "" : ok ? niveau(c.textContent, min, max) : micro && positif(c.textContent) ? "haut" : "";
        c.classList.toggle("bio-bas", v === "bas");
        c.classList.toggle("bio-haut", v === "haut");
      });
    }
  }
};

module.exports._test = { positif, lireNormes, bornes, niveau, sexeDeLaNote, cle, NORMES_DEFAUT };

  return module.exports;
})();

const { Modal, Plugin, apiVersion } = require("obsidian");

// Un seul plugin : chaque module est chargé comme un enfant, et déchargé avec lui.
// Un module qui plante au chargement n'empêche plus les autres ; la commande Diagnostic dit lequel et pourquoi.
module.exports = class OutilsHospitPlugin extends Plugin {
  onload() {
    this.etatModules = [];
    const modules = { copier: module_copier, examens: module_examens, tableaux: module_tableaux, filtres: module_filtres, replier: module_replier, pastilles: module_pastilles, couleurs: module_couleurs };
    for (const [nom, Module] of Object.entries(modules)) {
      const k = this.etatModules.push([nom, "chargé"]) - 1;
      const echec = (err) => {
        this.etatModules[k] = [nom, "ERREUR : " + (err && err.message ? err.message : err)];
        console.error("Outils hospit, module " + nom, err);
      };
      // Chargé à la main plutôt que par addChild : le chargement d'un Plugin est asynchrone,
      // son erreur arrive comme une promesse rejetée qu'addChild laisserait passer sans rien dire
      try {
        const child = new Module(this.app, this.manifest);
        this.register(() => child.unload());
        Promise.resolve(child.load()).catch(echec);
      } catch (err) {
        echec(err);
      }
    }
    this.addCommand({ id: "diagnostic", name: "Diagnostic", callback: () => this.diagnostic() });
  }

  diagnostic() {
    const v = (typeof process !== "undefined" && process.versions) || {};
    const lignes = [
      "Outils hospit " + this.manifest.version + " (dossier " + this.manifest.dir + ")",
      "Obsidian " + apiVersion + ", Electron " + (v.electron || "?") + ", Chrome " + (v.chrome || "?"),
      "",
      ...this.etatModules.map(([n, e]) => n + " : " + e),
      "",
    ];
    const vue = this.app.workspace.getActiveFile();
    const root = this.app.workspace.activeLeaf && this.app.workspace.activeLeaf.view.containerEl;
    if (vue && root) {
      const tables = [...root.querySelectorAll("table")];
      const examens = tables.filter((t) => [...(t.querySelector("tr") || { children: [] }).children].some((c) => (c.textContent || "").trim() === "Examen"));
      lignes.push("Note : " + vue.basename);
      lignes.push("Tableaux affichés : " + tables.length + ", dont tableau des examens : " + examens.length);
      lignes.push("Boutons de catégorie affichés : " + root.querySelectorAll(".exam-filtre-barre .exam-filtre-bouton").length);
    }
    const m = new Modal(this.app);
    m.titleEl.setText("Outils hospit : diagnostic");
    m.contentEl.createEl("pre", { text: lignes.join("\n") }).style.whiteSpace = "pre-wrap";
    m.open();
  }
};
