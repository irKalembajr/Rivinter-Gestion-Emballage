# Rivinter — mise à jour du 2 septembre 2026

Application Vite / JavaScript, Supabase et fonction serveur Vercel.

## Envoyer sur GitHub

Décompressez l'archive et envoyez son contenu à la racine du dépôt GitHub. `package.json`, `index.html`, `main.js`, `styles.css` et `vercel.json` doivent être à la racine, avec les dossiers `api`, `public` et `supabase`.

Ne publiez jamais de vrai fichier `.env` ni de clé privée. `.env.example` contient uniquement des exemples. Le fichier JavaScript actif est `main.js` à la racine. La copie ancienne du dossier `src` n'est pas incluse.

## Mise à jour de la base existante

1. Sauvegardez la base Supabase avant toute migration.
2. Pour la version existante déjà à jour d'août, exécutez uniquement `supabase/maj_20260825_consignation_bouteilles.sql` dans Supabase SQL Editor. Ce fichier a été complété pour ajouter les champs BV autonomes : réexécutez-le même si sa première version a déjà été appliquée.
3. Ce script conserve les achats, retours, consignations et leurs anciennes liaisons financières ; il ajoute les champs nécessaires et complète les références BV historiques.
4. Déployez ensuite cette version de l'application.

N'exécutez pas `schema.sql` sur la base de production existante pour cette mise à jour : il contient des données initiales et des mises à jour historiques. Il est fourni comme référence d'installation initiale. Les migrations du 9 et du 13 août sont conservées pour référence ; ne les relancez pas si elles ont déjà été appliquées. Aucun script de nettoyage immédiat n'est inclus. N'utilisez pas la réinitialisation principale si vous souhaitez conserver les données.

## Déployer sur Vercel

- Connecter le dépôt GitHub à Vercel.
- Framework : Vite.
- Build command : `npm run build`.
- Output directory : `dist`.
- Installation : `npm install`.

Renseigner les variables dans Vercel, jamais dans les fichiers GitHub :

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Les deux URL désignent le même projet Supabase existant. La clé `SUPABASE_SERVICE_ROLE_KEY` reste strictement côté serveur et ne doit jamais avoir le préfixe `VITE_`. La création de comptes utilise `api/invite-user.js` : GitHub Pages seul ne suffit pas à héberger cette fonction serveur.

## Lancement local

Copier `.env.example` vers `.env`, renseigner les valeurs, puis :

```sh
npm install
npm run dev
```

## Modules visibles

- Dashboard
- Gestion de sites : stock initial et objectifs mensuels en quantité
- Achats produits
- Retour emballages
- Consignation : emballages et bouteilles avec numéro et montant BV
- Reporting : objectifs, retours, bacs et écart du mois par site
- Gestion comptes

Les anciennes tables Finance, Capital, Audit et Gestion journalière sont conservées ; leurs modules ne sont plus proposés dans la navigation.

## Règles de consignation bouteilles

| Type | Prix par bouteille | Bouteilles par casier |
| --- | ---: | ---: |
| 65Cl | 1 000 Fc | 12 |
| 50Cl | 1 000 Fc | 20 |
| 33Cl Noir | 500 Fc | 24 |
| 33Cl Vert | 500 Fc | 24 |
| 30Cl | 500 Fc | 24 |

Seuls les casiers complets sont acceptés. Chaque casier constitué consomme un bac du site et augmente son solde d'emballages Brasimba. La valeur calculée doit correspondre au montant du BV saisi.

## Vérification de cette livraison

Les fichiers JavaScript ont été vérifiés syntaxiquement. La compilation Vite et les tests connectés Supabase ne sont pas validés localement : l'installation existante des dépendances présente un problème d'accès. Vérifier le build Vercel, puis tester les saisies et les rapports sur une base de test avant de remplacer la version en production.
