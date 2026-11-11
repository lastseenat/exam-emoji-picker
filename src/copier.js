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
