# RIVINTER SARLU - Gestion des emballages

Application web prete pour GitHub + Vercel, avec base de donnees et authentification Supabase.

## Modules inclus

- Dashboard global des emballages
- Gestion des sites et axes
- Stock initial depot et usine Brasimba en constante Q/V
- Achats produits Brasimba
- Retours / deconsignations emballages
- Audit mensuel
- Reporting CSV et impression PDF
- Gestion des comptes
- Reinitialisation reservee uniquement au compte `principal_admin`
- Comparaison Stock Initial vs Stock Calcule pour detecter anomalies, pertes, casses ou erreurs de saisie

## Architecture

- Frontend : Vite + JavaScript
- Hebergement : Vercel
- Base de donnees : Supabase Postgres
- Authentification : Supabase Auth email + mot de passe
- Creation des utilisateurs : fonction serveur Vercel `/api/invite-user`

## Roles

### Administrateur principal

- Acces global
- Peut creer/modifier les comptes
- Peut creer des administrateurs secondaires
- Peut verrouiller le stock initial apres configuration
- Peut reinitialiser les donnees d'exploitation

### Administrateur secondaire

- Acces global inchange sur la gestion quotidienne
- Peut charger, modifier, supprimer et saisir les donnees
- Peut creer des comptes utilisateurs et administrateurs secondaires
- Ne peut pas faire la reinitialisation principale
- Ne peut pas promouvoir un compte en administrateur principal
- Ne peut pas deverrouiller la constante de stock initial

### Utilisateur simple

- Consulte uniquement le site ou l'axe affecte
- Telecharge les rapports disponibles pour son affectation
- Ne modifie pas les donnees

## Logique des flux

Le Stock Initial est une constante de reference. Il possede deux attributs :

- `Q` : quantite
- `V` : valeur

Les achats produits `[Q, V]` declenchent :

- Stock Emballages depot : `+ Q` et `+ V emballages`
- Solde Brasimba usine : `- Q` et `- V emballages`
- Objectif d'achats : `+ Q`
- Total achats : `+ V produits`

Les retours emballages `[Q, V]` declenchent :

- Solde Brasimba usine : `+ Q` et `+ V emballages`
- Stock Emballages depot : `- Q` et `- V emballages`

Calcul central :

```text
Stock Emballages Calcule = Stock Initial + Achats - Retours
```

Le module de controle compare ensuite :

```text
Stock Initial vs Stock Emballages Calcule
```

Un ecart signale une anomalie possible : perte, casse d'emballages, erreur de saisie ou incoherence dans le circuit depot / Brasimba.

## Configuration du stock initial

1. Ouvrez `Gestion de sites`.
2. Verifiez ou saisissez les valeurs initiales `Q` et `V`.
3. Le compte `principal_admin` clique sur `Verrouiller le stock initial`.

Apres verrouillage, le stock initial reste immuable dans l'application. Une reinitialisation principale remet les stocks initiaux de reference et rouvre la configuration.

## Deploiement Supabase

1. Creez un projet sur Supabase.
2. Ouvrez `SQL Editor`.
3. Copiez tout le contenu de `supabase/schema.sql`.
4. Executez le script.
5. Dans Supabase, allez dans `Project Settings > API`.
6. Notez :
   - Project URL
   - anon public key
   - service_role key

## Premier administrateur principal

1. Deployez ou lancez l'application.
2. Cliquez sur `Creer un compte initial`.
3. Creez le premier compte avec votre email.
4. Dans Supabase, ouvrez `SQL Editor`.
5. Executez cette commande en remplacant l'email :

```sql
update public.profiles
set role = 'principal_admin',
    location_id = null,
    active = true
where email = 'votre-email@exemple.com';
```

6. Reconnectez-vous dans l'application.

## Variables Vercel

Dans Vercel, ajoutez ces variables dans `Project Settings > Environment Variables` :

```text
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre-cle-anon-publique
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_ROLE_KEY=votre-cle-service-role-privee
```

Important : `SUPABASE_SERVICE_ROLE_KEY` doit rester privee. Elle est utilisee seulement par la fonction serveur Vercel.

## Deploiement GitHub + Vercel

1. Creez un depot GitHub, par exemple `rivinter-emballages`.
2. Envoyez tout le contenu de ce dossier dans le depot.
3. Connectez-vous a Vercel.
4. Cliquez sur `Add New Project`.
5. Importez le depot GitHub.
6. Framework detecte : `Vite`.
7. Build command : `npm run build`.
8. Output directory : `dist`.
9. Ajoutez les variables d'environnement ci-dessus.
10. Lancez le deploiement.

## Lancement local

Creez un fichier `.env` a partir de `.env.example`, puis :

```bash
npm install
npm run dev
```

## Reinitialisation

La reinitialisation se trouve dans :

```text
Gestion comptes > Reinitialisation principale
```

Elle est visible uniquement pour `principal_admin`. Elle supprime :

- achats
- retours emballages
- audits
- objectifs

Puis elle remet les stocks initiaux de reference importes du classeur Excel et deverrouille la configuration initiale.
