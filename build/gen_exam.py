"""Génère, pour chaque image vérifiée, une question « quel examen, quel plan ? » (thème « examen »)."""
import json, os, random

RETENIR_EX = ("<b>Coupe + os blanc</b> = scanner · <b>coupe + os noir + tissus mous très contrastés</b> = IRM · "
              "<b>tout superposé, pas de coupe</b> = radiographie · <b>éventail granuleux, liquide noir</b> = échographie.")

def generate(cards, build_dir):
    ex = json.load(open(os.path.join(build_dir, "examens.json"), encoding="utf8"))
    MODS, PL = ex["modalities"], ex["planes"]
    gen = []
    for c in cards:
        if c.get("exam") is False or c["modality"] not in MODS: continue
        rnd = random.Random(c["id"])
        m, p = c["modality"], c.get("plane")
        pool = [x for x in ("rx", "ct", "irm", "echo") if x != m]
        has_plane = p in PL and m != "echo"
        wrong_m = rnd.sample(pool, 2 if has_plane else 3)
        opts = [["C'est " + MODS[m]["nom"], True, MODS[m]["oui"]]]
        opts += [["C'est " + MODS[w]["nom"], False, MODS[w]["non"]] for w in wrong_m]
        if has_plane:
            fam = ["face", "profil"] if p in ("face", "profil", "oblique") else ["axial", "coronal", "sagittal"]
            wp = rnd.choice([x for x in fam if x != p])
            opts += [["Il s'agit d'" + PL[p]["nom"], True, PL[p]["oui"]], ["Il s'agit d'" + PL[wp]["nom"], False, PL[wp]["non"]]]
        extra = [x for x in ("mammo", "angio", "scinti") if x != m]
        rnd.shuffle(extra)
        while len(opts) < 5:
            w = extra.pop()
            opts.append(["C'est " + MODS[w]["nom"], False, MODS[w]["non"]])
        gen.append({"id": c["id"] + "_ex", "img": c["img"], "region": c["region"], "type": "examen", "modality": m, "plane": p,
                    "title": "Examen et plan — " + c["title"], "src": c["src"],
                    "q": "Ne t'occupe pas de la maladie : avec quel examen" + (" et dans quel plan" if has_plane else "") +
                         " cette image a-t-elle été obtenue ?",
                    "opts": opts,
                    "lecture": "<p>" + MODS[m]["oui"] + "</p>" + ("<p>" + PL[p]["oui"] + "</p>" if has_plane else ""),
                    "analyse": c.get("exam_note", ""),
                    "retenir": RETENIR_EX})
    return gen
