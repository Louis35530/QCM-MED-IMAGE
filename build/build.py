"""Construit data/cards.js, data/img/ et sw.js à partir de build/cards/*.json et build/raw/.
Format d'une carte (JSON) :
{ "id", "img" (fichier dans raw/), "region", "type", "modality", "plane", "title", "hint"?, "single"?,
  "q", "opts": [[texte, vrai?, justification], ...] (5), "lecture", "analyse", "retenir",
  "src": {"t", "a", "l", "u"} }"""
import json, glob, os, sys, hashlib
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = os.path.join(ROOT, "build")
tax = json.load(open(os.path.join(B, "taxonomy.json"), encoding="utf8"))
cards, errors, ids = [], [], set()
# métadonnées des images téléchargées (raw/<source>/manifest.jsonl) pour remplir "src" automatiquement
META = {}
for mf in glob.glob(os.path.join(B, "raw", "*", "manifest.jsonl")):
    sub = os.path.basename(os.path.dirname(mf))
    for l in open(mf, encoding="utf8"):
        r = json.loads(l); META[sub + "/" + r["file"]] = r
LIC = {"byncnd": "CC BY-NC-ND", "byncsa": "CC BY-NC-SA", "bync": "CC BY-NC", "by": "CC BY", "bysa": "CC BY-SA"}
def auto_src(img):
    r = META.get(img)
    if not r: return None
    if "uid" in r:   # MedPix via Open-i
        return {"t": "MedPix — " + r["title"], "a": r.get("authors", ""), "l": LIC.get(r.get("license"), r.get("license", "")) + " · MedPix (NLM)",
                "u": r.get("page") or "https://openi.nlm.nih.gov/detailedresult?img=" + r["imgid"]}
    return {"t": r["title"].replace("File:", ""), "a": r.get("artist", ""), "l": r.get("license", "") + " · Wikimedia Commons", "u": r.get("page", "")}
for f in sorted(glob.glob(os.path.join(B, "cards", "*.json"))):
    for c in json.load(open(f, encoding="utf8")):
        where = f"{os.path.basename(f)}:{c.get('id')}"
        if c["id"] in ids: errors.append(where + " id en double")
        ids.add(c["id"])
        for k in ("region", "type", "modality"):
            if c.get(k) not in tax[k + "s" if k != "modality" else "modalities"]: errors.append(f"{where} {k} inconnu: {c.get(k)}")
        if len(c["opts"]) != 5: errors.append(where + " il faut 5 propositions")
        if not any(o[1] for o in c["opts"]): errors.append(where + " aucune bonne réponse")
        if c.get("single") and sum(1 for o in c["opts"] if o[1]) != 1: errors.append(where + " single mais plusieurs bonnes réponses")
        if not all(o[2] for o in c["opts"]): errors.append(where + " justification manquante")
        if not os.path.exists(os.path.join(B, "raw", c["img"])): errors.append(where + " image absente: " + c["img"])
        if not c.get("src"):
            c["src"] = auto_src(c["img"])
            if not c["src"]: errors.append(where + " source inconnue")
        cards.append(c)
if errors:
    print("\n".join(errors)); sys.exit(1)
sys.path.insert(0, B); import gen_exam
cards += gen_exam.generate(cards, B)
out_img = os.path.join(ROOT, "data", "img"); os.makedirs(out_img, exist_ok=True)
used = set()
for c in cards:
    base = os.path.splitext(c["img"])[0].replace("/", "_") + ".jpg"
    dst = os.path.join(out_img, base); used.add(base)
    src = os.path.join(B, "raw", c["img"])
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
        im = Image.open(src); im.seek(0); im = im.convert("RGB"); im.thumbnail((1100, 1100))
        im.save(dst, quality=86, optimize=True)
    c["img"] = base
for f in os.listdir(out_img):
    if f not in used: os.remove(os.path.join(out_img, f))
for c in cards:
    c["opts"] = [{"t": t, "ok": bool(ok), "why": why} for t, ok, why in c["opts"]]
gloss = json.load(open(os.path.join(B, "glossaire.json"), encoding="utf8"))
import html as _h
basics = open(os.path.join(B, "basics.html"), encoding="utf8").read()
basics += '<article class="card"><h2>8. Lexique des sigles</h2><p class="muted small">Partout dans l’app, un sigle souligné en pointillés affiche sa signification quand tu appuies dessus.</p><div class="tbl"><table>' + "".join(
    f"<tr><td><b>{_h.escape(k)}</b></td><td>{_h.escape(v)}</td></tr>" for k, v in sorted(gloss.items(), key=lambda kv: kv[0].lower())) + "</table></div></article>"
terms = json.load(open(os.path.join(B, "termes.json"), encoding="utf8"))
basics += '<article class="card"><h2>9. Lexique des termes médicaux</h2><p class="muted small">Dans les questions et corrections, ces termes sont soulignés la première fois qu’ils apparaissent.</p><div class="tbl"><table>' + "".join(
    f"<tr><td><b>{_h.escape(k)}</b></td><td>{_h.escape(v)}</td></tr>" for k, v in sorted(terms.items(), key=lambda kv: kv[0].lower())) + "</table></div></article>"
data = dict(tax, cards=cards, basics=basics, glossary=gloss, terms=terms)
js = "window.RQ_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
open(os.path.join(ROOT, "data", "cards.js"), "w", encoding="utf8").write(js)
# service worker : met en cache l'app + toutes les images ; la version change dès que le contenu change
files = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "data/cards.js",
         "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"] + ["data/img/" + f for f in sorted(used)]
h = hashlib.sha1()
for f in files[1:]:
    h.update(open(os.path.join(ROOT, f), "rb").read())
sw = open(os.path.join(B, "sw.template.js"), encoding="utf8").read()
sw = sw.replace("__VERSION__", h.hexdigest()[:10]).replace("__FILES__", json.dumps(files))
open(os.path.join(ROOT, "sw.js"), "w", encoding="utf8").write(sw)
print(f"{len(cards)} cartes, {len(used)} images, version {h.hexdigest()[:10]}")
