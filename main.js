// Outils hospit : fichier généré par build.cjs à partir de src/, ne pas le modifier directement

// ===== Boutons Copier : à côté des titres et de chaque jour d'hospitalisation (mode lecture) (src/copier.js) =====
const module_copier = (function () {
  const module = { exports: {} };
const { Notice, Plugin, TFile, setIcon } = require("obsidian");

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
  return more.length ? `${main} (${more.map(lowerFirst).join(", ")})` : main || "";
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
      out.push(flat(c[0]).toUpperCase());
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

// Histoire de la maladie : section HDM telle quelle (puces gardées), sans gras
function histoire(ls) {
  return ls
    .map((l) => l.replace(/==|\*\*|__|~~/g, "").trimEnd())
    .filter((l) => l.trim() && l.trim() !== "-")
    .join("\n");
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
    const c = cells(l).map(clean);
    if (isTitle(c) || c[0] === "Nom") continue;
    if (c[0]) names.push(c[1] ? `${c[0]} : ${c[1]}` : c[0]);
  }
  return names.join("\n");
}

// Mode de vie : tel quel, puces gardées, sans gras
function modeDeVie(ls) {
  return ls
    .map((l) => (l.trim() ? l.replace(/^(\s*[-*+]\s+)(.*)$/, (m, p, t) => p.trim() + " " + clean(t).replace(/^([^:]*:\s*)(.*)$/, (x, a, b) => a + lowerFirst(b))).trim() : ""))
    .filter((l) => l && l !== "-" && !/:\s*$/.test(l)) // intitulés non renseignés retirés
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

const KINDS = [
  { re: /Antécédents/i, build: antecedents },
  { re: /Mode de vie/i, build: modeDeVie },
  { re: /HDM|Histoire de la maladie/i, build: histoire },
  { re: /Traitement/i, build: traitementHabituel },
  { re: /Examen clinique d'entrée/i, build: examenEntree, wholeNote: true },
];

// ---------- Plugin ----------

module.exports = class CopyButtonsPlugin extends Plugin {
  onload() {
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

  addButton(parent, before, sourcePath, build) {
    const btn = createEl("button", { cls: "copy-buttons-btn clickable-icon", attr: { "aria-label": "Copier", type: "button" } });
    setIcon(btn, "copy");
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Relire la note au clic : le texte copié est toujours celui du moment
      const file = this.app.vault.getAbstractFileByPath(sourcePath);
      if (!(file instanceof TFile)) return;
      const ls = (await this.app.vault.read(file)).split(/\r?\n/);
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

module.exports._test = { antecedents, traitementHabituel, modeDeVie, jour, sectionAt, examenEntree, histoire };

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

        editor.setValue(updated);
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

      new ExamEmojiModal(this.app, (emoji) => {
        const source = view.editor.getValue();
        const updated = replaceExamButtonAt(source, targetIndex, emoji);
        if (updated === source) {
          new Notice("Le bouton d’examen est introuvable dans cette note.");
          return;
        }

        view.editor.setValue(updated);
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
  return found && rest.replace(/<br\s*\/?>|&nbsp;|[*_=\s]/gi, "") === "";
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

// Lignes barrées en haut, les autres en dessous, chacune dans son ordre d'origine
function sortDataRows(rows) {
  const out = [];
  let groups = [];
  const flush = () => {
    for (const g of groups.filter((g) => g.struck)) out.push(...g.lines);
    for (const g of groups.filter((g) => !g.struck)) out.push(...g.lines);
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
      groups.push({ lines: [line], struck: isStruckRow(cells) });
    }
  }
  flush();
  return out;
}

const dataRows = (lines, t) => lines.slice(t.start + 2, t.end);

function needsSort(lines, t) {
  const rows = dataRows(lines, t);
  return sortDataRows(rows).some((l, k) => l !== rows[k]);
}

// Trie les tableaux retenus par `pick` (tous par défaut) ; renvoie le texte et le nombre de tableaux modifiés
function sortTables(text, pick = () => true) {
  const lines = text.split("\n");
  let changed = 0;
  findTables(lines).forEach((t, index) => {
    if (!pick(t, index)) return;
    const rows = dataRows(lines, t);
    const sorted = sortDataRows(rows);
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

module.exports._internals = { findTables, sortTables, sortDataRows, needsSort, isStruckCell, splitCells, mergeRect, splitRaw };

  return module.exports;
})();

const { Plugin } = require("obsidian");

// Un seul plugin : chaque module est chargé comme un enfant, et déchargé avec lui
module.exports = class OutilsHospitPlugin extends Plugin {
  onload() {
    for (const Module of [module_copier, module_examens, module_tableaux]) {
      this.addChild(new Module(this.app, this.manifest));
    }
  }
};
