# Radio QCM — mise en ligne et installation sur iPhone

## Mettre en ligne (Vercel)

Une seule fois : se connecter à Vercel depuis ce PC.

```
vercel login
```

Puis, depuis ce dossier (`Desktop\Radio-QCM`), à chaque mise à jour :

```
python build/build.py      # reconstruit data/cards.js, les images et sw.js
vercel deploy --prod --yes # publie
```

Le dossier `build/` (sources des cartes, images brutes, scripts) n'est jamais envoyé
(voir `.vercelignore`). Le site est marqué `noindex` : il n'apparaît pas dans Google.

## Installer sur l'iPhone

1. Ouvrir l'adresse `https://….vercel.app` dans **Safari** (pas Chrome).
2. Bouton **Partager** (carré avec une flèche) → **Sur l'écran d'accueil** → Ajouter.
3. Ouvrir l'app depuis l'icône : plein écran, et elle fonctionne **hors connexion**
   après la première ouverture (toutes les images sont mises en cache).

Après une mise à jour, il suffit d'ouvrir l'app avec du réseau : elle se recharge
toute seule sur la nouvelle version. La progression (révisions) est conservée.

## Ajouter des cartes

Les cartes sont dans `build/cards/*.json` (une carte = une image + une QRM à 5
propositions + correction + repères `marks` en coordonnées 0-1 de l'image).
Les questions « quel examen, quel plan ? » sont générées automatiquement par
`build/gen_exam.py`. Le lexique des sigles est dans `build/glossaire.json`.
