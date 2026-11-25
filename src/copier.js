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
