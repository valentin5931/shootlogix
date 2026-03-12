# ShootLogix — Contexte Agent

## Stack
- Backend : Flask (Python)
- Frontend : Vanilla JS (fichier unique ~10600 lignes)
- Base de données : SQLite
- Déployé sur Railway
- Auth : JWT, RBAC 4 rôles (Admin/Unit/Transpo/Reader)

## Structure
- app.py : point d'entrée Flask, 173 endpoints API
- 40+ tables SQLite
- Multi-projet

## Règles strictes
- NE JAMAIS toucher à l'auth, au RBAC, ni aux permissions
- Migrations additives uniquement : jamais de DROP TABLE, jamais de suppression de colonne
- Un commit par feature atomique : [MODULE] description courte
- Mobile-first : tester mentalement à 375px et 768px
- Performance : aucun schedule > 500ms pour 30 jours x 25 lignes

## Projet actif
- KLAS7 : Koh-Lanta Saison 7, Panama, Pearl Islands, mars-avril 2026
- PDT actif : 32 jours, 25 mars - 25 avril 2026
- 11 modules : PDT, Locations, Boats, Picture Boats, Security Boats, Transport, Fuel, Labour, Guards, FNB, Budget

## Plan d'amélioration
Voir ~/claude/SHOOT_IMP.md pour les specs complètes
```

Sauvegarde. Puis vérifie le git :
``
cd ~/claude/shootlogix/SHOOTLOGIX && git status
