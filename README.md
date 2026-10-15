# Radio QCM

QCM d'imagerie médicale (radio, scanner, IRM, échographie…) avec répétition espacée, pensé pour un étudiant en 2e année de médecine. Web-app installable sur iPhone (Safari → Partager → « Sur l'écran d'accueil »), utilisable hors connexion.

- Questions à réponses multiples (5 propositions, ordre aléatoire), correction détaillée item par item, repères jaunes sur l'image.
- Thèmes par région du corps et par type de lésion, plus des questions « quel examen, quel plan ? ».
- Sigles et termes médicaux soulignés : un appui affiche la définition.

Sources des cartes : `build/cards/*.json`. Reconstruire : `python build/build.py`. Mise en ligne : voir `DEPLOIEMENT.md`.

## Images

Usage pédagogique personnel, non commercial. Chaque image est créditée dans l'app (auteur, licence, lien).
- MedPix® (U.S. National Library of Medicine), via Open-i — CC BY-NC-ND.
- Wikimedia Commons — CC0, CC BY, CC BY-SA selon l'image.
