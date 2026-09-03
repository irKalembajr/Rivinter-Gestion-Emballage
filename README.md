# Rivinter — Suivi des emballages v2

Application Vite en français, interface bleu nuit/or inspirée de Bouclage SRD, logique par site/axe et tableau signé par Bremer inspiré du classeur fourni. Sans configuration Supabase, elle démarre en démonstration avec des données entièrement fictives, perdues au rechargement.

## Règles de calcul

Le solde signé est une position comptable, pas le stock physique du dépôt. Négatif : Brasimba doit à Rivinter. Positif : Rivinter doit à Brasimba. Le parc comptable Brasimba est l'opposé de ce solde ; un parc négatif représente donc une dette, pas des emballages physiques négatifs.

| Mouvement | Dépôt | Solde signé |
|---|---:|---:|
| Achat | +quantité | +quantité |
| Retour | −quantité | −quantité |
| Nouvelle consignation emballages | −quantité | −quantité |
| Consignation bouteilles | −1 BAC par casier constitué | −casiers constitués |
| Perte / vol au dépôt | −quantité | inchangé |
| Casse chez Brasimba | inchangé | +quantité |

La perte au dépôt ne modifie pas la créance sur Brasimba : elle modifie le stock et les indicateurs de pertes. Une casse chez Brasimba dégrade en revanche cette créance. Les soldes peuvent traverser zéro. Les emballages pleins et vides sont comptés ensemble ; aucune estimation de leur répartition n'est inventée.

Bouteilles : 65 cl = 12 × 1 000 Fc ; 50 cl = 20 × 1 000 Fc ; 33 cl noir/vert et 30 cl = 24 × 500 Fc. Les casiers incomplets sont refusés. Le BV doit correspondre exactement au total des lignes consignées, éventuellement mixtes. Valorisation emballages : 16 500 Fc sauf ALE50 à 24 500 Fc et BAC à 4 500 Fc. Le reporting sépare les BAC des casiers pour éviter les doubles comptes.

Écart de période = achats − retours sur la même période, indépendamment du solde cumulé et des consignations. Les objectifs sont en quantité seulement. Les soldes sont calculés jusqu'à la date de fin, avec les reports et tous les mouvements antérieurs. Chaque site/axe reste indépendant ; les tableaux globaux consolident les périmètres autorisés.

## Installation et GitHub / Vercel

1. Déposer le contenu de ce dossier dans un dépôt GitHub, sans node_modules, dist ni secrets.
2. Installer Node.js 20+ et pnpm, puis `pnpm install`, `pnpm test`, `pnpm dev`.
3. `pnpm build` produit dist. Vercel : commande de build `pnpm build`, sortie `dist`, fonction `/api/invite-user` incluse.
4. Pour connecter la base, copier `.env.example` vers `.env.local` et renseigner les variables. Ne jamais préfixer la clé service-role par VITE_ ni la livrer au navigateur. La clé service-role reste exclusivement dans l'environnement serveur Vercel.

La démonstration statique Sites ne contient aucune clé et ne gère pas d'invitations réelles. La gestion réelle des comptes requiert Supabase et la fonction serveur Vercel. Les contrôles de rôle serveur restent obligatoires même si un bouton est masqué dans l'interface.

## Migration prudente de la base existante

Cette livraison cible la base de l'ancienne application, pas une base vide. Elle suppose ses tables locations, bremers, products, product_prices, profiles, initial_stocks, global_factory_initial, objectives, purchases, packaging_returns et ses fonctions de droits existantes. PostgreSQL 15+ est requis pour la vue security_invoker.

1. Sauvegarder la base et créer une copie de test.
2. Vérifier les six identifiants Bremer : B65, B33N, B33V, B30CL, ALE50, BAC.
3. Faire examiner puis appliquer `supabase/20260903_rivinter_v2.sql` sur la copie. C'est une migration additive ; ne pas réexécuter un ancien script de réinitialisation.
4. Comparer les soldes site par site avec la version précédente et les pièces validées. Tester les rôles, un achat, un retour, les deux consignations, une casse et une annulation.
5. Après validation et sauvegarde, planifier la bascule et retirer l'ancienne interface de saisie. Ses anciennes écritures ne bénéficient pas des contrôles transactionnels v2.

Les anciennes consignations conservent leurs effets d'origine (sans nouvelle déduction rétroactive du dépôt). Les nouvelles consignations appliquent la règle demandée. Les reports Brasimba historiques sont inversés pour obtenir la convention de signe Excel. Un report global non réparti reste présenté séparément, sans allocation arbitraire aux sites. Le stock initial d'un site avec mouvements ne peut plus être réécrit par cette interface.

Les anciens modules finance restent dans la base mais ne sont plus chargés ni exposés. Le fichier Excel n'est pas importé automatiquement : son nom SEPT et sa période interne d'août 2026 ainsi que les anomalies de formules nécessitent une validation métier avant reprise. La photo est une référence de présentation, pas une source de soldes réels.

## Contrôles et limites de validation

Les écritures v2 passent par des fonctions SQL transactionnelles : contrôle des droits, quantités entières, prix recalculés côté serveur, BV exact, référence active unique, anti-double-envoi, contrôle de stock incluant les dates ultérieures. Une annulation reste tracée avec son motif ; elle ne supprime pas l'historique.

16 tests unitaires du moteur passent et la compilation de production passe. La migration SQL n'a pas été exécutée sur une base de test ou de production ; sa validation PostgreSQL et les tests des politiques RLS restent indispensables avant utilisation réelle. Aucun test visuel/interactif navigateur complet n'a été effectué. Les outils WebMCP sont facultatifs et leur validation dans un contexte compatible n'a pas été effectuée. Aucune donnée réelle n'a été modifiée.
