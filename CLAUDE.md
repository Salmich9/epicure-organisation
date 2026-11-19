# Epicure · Organisation des événements · fiche de reprise

À lire en premier dans toute nouvelle conversation sur ce dépôt. Elle dit où on en est, comment Salmane veut travailler, et ce qui reste à faire. **Prochaine version : v82** (v81 sur la branche `v81-cout-qui-bouge` tant que Salmane n'a pas dit oui).

## Le but
Organiser un événement Epicure, quelle que soit sa taille, en moins de 10 minutes, ultra flexible et précis, sans rien perdre en détail, délégation, historique, tableau de bord et conseils de l'IA. Hamza, Soufiane et Salmane doivent organiser exactement de la même façon : une seule méthode pour la boîte. Logique « du général au particulier » : chiffrage précis, puis on affine jusqu'à l'organisation finale, sans jamais reposer ce qui est validé.

## Accès
- Dépôt : Salmich9/epicure-organisation (PUBLIC : aucun secret dans le code, le chat ou les journaux). `main` se déploie seul sur Vercel.
- Vercel : équipe « Epicure's projects » (`team_D1CJCjMQbu6wHzW7Hq9WVAtt`), projet `epicure-organisation` (`prj_WfvycA1PKj50uv8rujWgRlIde5N4`), adresse epicure-organisation.vercel.app. React 18 + Vite, Node 24.
- Supabase : projet `daehifcdzrusxtzhtuxi` (Epicure-dev), **schéma `orga`** pour cette appli. Le schéma `public` est celui du dépôt (ancienne appli epicure-app) : **ne jamais le modifier sans l'accord de Salmane**.
- Fonctions Edge (toutes `verify_jwt: false`, elles vérifient le jeton elles-mêmes) : orga-voix (v6), orga-cadrage-ia (v1), orga-copilote, orga-zoho (v10), orga-notifs, orga-especes, orga-bon, orga-imputer, orga-photo, orga-dicter, orga-fichier, orga-sante, orga-sauvegarde. Secrets du projet (ANTHROPIC_API_KEY…) partagés entre fonctions.
- Agent vocal ElevenLabs « Epicure · Chiffrage devis » : agent `agent_7201m5t5aynbfdcsexzx82j4mprz`, branche principale `agtbrch_3001m5t5b02kedsr85hz0r9pny5y`. Outils (webhooks vers orga-voix) : chiffrer `tool_2601m5t5qaerf4qrm40dywm8mtfq`, reperes `tool_0701m5t5qdkcffj9r6aaz3f1aycz`, creer_dans_appli `tool_6601m5zhtqp7ef1vw52p8mbtarvd`, cout_appel `tool_0901m5t70c17eew9v5b3fes48sbw`, contexte `tool_3701m600z5z7fg5tysvqbk4c7vtc`, questions `tool_0001m7k194jxe0ntvfx7ff86mw17`, evenement `tool_2401m7k1955rfnh9frhbdjsntrar`. Variables dynamiques : orga_token, qui, mode (chiffrage ou challenge), evt, premier_message. Le texte du prompt vit dans `docs/agent-vocal-prompt.md` (le recopier dans l'agent après chaque changement).
- Zoho Books (devis brouillons) : par orga-zoho ; orgs dans `orga.parametres` clé `zoho`.
- **`orga.parametres` contient des secrets** (bot_secret, notifs_vapid, zoho refresh, sante…) : ne jamais afficher son contenu entier, sélectionner seulement la clé voulue.

## Façon de travailler (Salmane)
- Toujours en français. Réponses courtes et directes, analogies. Pas de tirets dans ce qui est écrit à sa place.
- **Une branche par version** (`vNN-sujet`), commit, push, **captures téléphone réelles** (Playwright, données fictives) envoyées avant toute fusion ; **fusion dans `main` seulement après son « oui »**. Après fusion, vérifier que le déploiement Vercel est READY.
- Poser des questions avant un gros chantier (AskUserQuestion, 3 à 4 questions par tour, option recommandée en premier). Corrections de données : une proposition par message.
- **Tout ce qui règle le chiffrage vit dans les Paramètres** (questions de l'agent, coûts, ratios, seuils, conditions, timeline…), modifiable par lui, rien de codé en dur inutilement. Un nouveau poste se crée à 0 « à régler » : ne jamais inventer de prix.
- Écrans : le moins de texte possible, bulles d'info (`Info`) plutôt que paragraphes, chemin logique entre les éléments cliquables. Flexibilité partout (ajouter, modifier, annuler).
- Fiabilité avant vitesse ; jamais compromettre l'appli en place ; pour/contre de chaque proposition.
- L'équipe ne voit jamais prix de vente, marge ni prix d'achat du dépôt. Les pièces bloquées vont à Salmane seulement ; rien ne débloque un paiement depuis une notification. Sociétés séparées (Epicure, Business Boys, Espèce).
- Migrations : **éviter DROP et DELETE** dans le SQL envoyé (Supabase demande une confirmation qu'il ne voit pas sur son téléphone) : `create or replace trigger`, mises à jour par `replace()` de la définition (blocs `do $$ … pg_get_functiondef … execute`). Si une confirmation expire, s'arrêter et le dire.
- Trailer de commit :
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01LRHbtsMarkWQGJvUbTHe7T` (remplacer par la ligne de la nouvelle conversation).

## Tests (tous doivent passer avant de proposer une fusion)
- `npm test` (vitest, 56 tests, `tests/unit`).
- `npm run build && npm run test:e2e` : Playwright sur données fictives, RPC simulées (`tests/e2e/fixture.mjs`, `questions.fixture.mjs`). Chaque fichier écrit « XXX OK ». Captures : `node tests/e2e/<fichier>.mjs <dossier>`. Un nouvel écran = un nouveau fichier e2e ajouté à la chaîne `test:e2e` de package.json.
- SQL : `tests/sql/*.sql` et `supabase/tests/regression.sql`, à lancer par execute_sql. Ils finissent par une erreur volontaire « RESULTATS n / n : tout passe » (tout est annulé). Une session de test se crée seulement dans ces blocs annulés (insert dans `orga.sessions`) ; ne pas créer de session réelle.
- Essayer une migration **avant** de la mettre en ligne : un seul appel execute_sql = le contenu de la migration, puis un bloc `do $tous$ … $tous$` qui lance chaque test par `begin execute $t1$ <le test> $t1$; exception when others then res := res || sqlerrm; end;` et finit par `raise exception 'BILAN%', res`. Tout est annulé, un seul « Autoriser » pour Salmane. Vérifié : une erreur finale ne laisse rien en base.
- Échecs connus, d'avant v81 (à réparer à part) : `notifs.sql` 21 / 25 (points 4, 5, 6, 23, rappels depuis la timeline v78) ; `cadrage_propositions.sql` point 6 (compte aussi les vrais événements proches de la base) ; `regression.sql` contrôle 1 (ne reconnaît pas `_qui_associe`, et `_mt`, `_court`, `_societe`, `_hhmm`, `_code_evt`, `_cle_lieu` sont ouvertes à anon) et contrôle 11 (liste de codes d'erreur en retard : `reserve_associes`, `valeur_invalide`…). Les contrôles 2 à 10 passent.
- Le conteneur ne joint pas `*.supabase.co/functions` : une fonction Edge se teste par l'appli ou ses journaux.

## Parcours décidé (le « funnel »), du général au particulier
| Étape | Décision de Salmane |
|---|---|
| Entrée | Plusieurs personnes peuvent créer un événement |
| Pour chiffrer | Date, invités, lieu, prestations, gamme, **début et fin** obligatoires |
| Chiffrage | Précis dès le départ, menu sur mesure ; prix = coût × coef (taille × gamme) |
| Devis | Versions successives figées à chaque envoi ; Ghali, Hamza, Soufiane, Salmane chiffrent et envoient |
| Devis ouvert = option | Bloquer la date, les personnes clés et le matériel du dépôt ; relance |
| Acompte | Reçu → Confirmé automatique ; le reste reste manuel (« rien sans moi ») |
| Changement après signature | Nouvelle version du devis |
| Enveloppes | Objectif plus serré : coût −10 % |
| Check-list | Lignes du chiffrage + modèle par zone ; attribution automatique puis retouche |
| Achats | Séparés par événement |
| Planning | Automatique, puis chaque responsable ajuste |
| Staff | Confirmation par lien |
| Jour J | Déroulé, brief, chargement, contacts |
| Clôture | Solde encaissé + pièces rangées + matériel revenu + bilan |

## Ce qui est fait (v68 à v80, toutes fusionnées et en ligne)
- **v68 · Espèces de l'événement** (`src/especesRelais.jsx`, migrations 68, 68b) : virement au fournisseur relais (garde 5 %), validation par Salmane, réception avec écart, remise confirmée par chaque responsable, bon payé par la caisse. Paramètres › Espèces.
- **v69 · Demande complète et gamme** (69) : `evenements.gamme` (Classique, Premium ×1,08, Prestige ×1,15, params `g_gamme_*`), coef = palier de taille × `_gamme_mult`. Écran « Avant de chiffrer » tant qu'il manque une info.
- **v70 · Versions du devis** (70) : table `devis_versions`, `devis_envoyer` fige Vn et passe le statut à « Devis envoyé » ; écarts ligne par ligne entre versions (`src/cycle.jsx` DevisClient).
- **v71 · Chaque réponse agit sur le chiffrage** (71) : moteur `orga._chiffrage_moteur(b)` sur `orga.chiffrage_params` (calculs par_base, un_pour, fixe, pct, heures_sup ; colonnes `si`, `a_regler`, `fourni_si`, `min_par_bar`). Drapeaux dérivés été, nuit (+25 % après 2 h), longue (2e repas, heures sup sur 8 h). Chef de bar par bar, 2 bartenders mini par bar, kit et comptoir par bar ; fourni par le lieu = ligne à 0 « à confirmer par écrit ».
- **v72 · Questions et seuils dans les Paramètres** (72a à 72d) : table `orga.chiffrage_questions` (une seule liste pour l'agent vocal et le chiffrage écrit : texte, aide, type, choix, défaut, `quand`, express, ordre, actif), `orga._reponses(b)`, seuils `r_*`, conditions du devis (`parametres` 'devis'). Postes créables et « Compté quand ? » sur chaque poste (`src/questions.jsx`, `src/chiffrage.jsx`). Seul Salmane modifie (`parametres` `chiffrage_editeurs`).
- **v73 · Agent vocal et Challenge** (73) : l'agent lit les questions (outil `questions`), chiffre avec le même moteur ; « 🎙 Challenge-moi » sur l'événement (route `challenge/EVT`, `voix_evenement`) ; propositions de challenge par notification à la confirmation, J−30, J−7 (`parametres` 'challenge', **actif**).
- **v74 · Le cadrage affine** (74) : ce que le devis a dit est repris (« Repris du devis », corrigeable, jamais reposé), le défaut revient pré-choisi, puis les questions propres au cadrage (partie `organisation` des Questions : emplacement, sol, profil, invités particuliers, thème, particularité). Réponses dans `evenements.cadrage->'affine'` (l'ancienne clé `reponses` n'est plus écrite). Pur : `planCadrage` dans `src/questions.jsx`. La partie « Cadrage » du chiffrage s'appelle « Bases ».
- **v75 · Propositions du cadrage** (75) : d'abord le même lieu (`_cle_lieu` : sans accents, espaces, ponctuation), puis les événements proches (même gamme, mêmes prestations, invités ±30 %, au moins 2 d'accord), le lieu gagne un désaccord (bulle « pourquoi » avec l'avis des proches) ; l'IA en dernier par la fonction `orga-cadrage-ia` (seulement les questions à choix non tranchées, sans prix, une fois par question : `cadrage->'ia'`). Réglages `r_proche_*`, `r_ia_cadrage` dans Paramètres › Marges. Lieux connus proposés à la saisie (`lieux_connus`). **Pas encore testé en vrai.**
- **v76 · Parts des associés** (76) : carte « Parts 2026 » en haut d'Aujourd'hui et écran `#/parts`, visibles **seulement** par Salmane, Hamza, « Soufiane Hadni » (`parametres` 'associes', vérifié côté serveur : `_qui_associe`) ; Salmane seul modifie (apporteur, opérateurs, agence, allocations, versements). Calcul `_parts_evt` : HT − agence − apporteur 5 % − opérateurs 5 % − coût (par enveloppe le plus haut entre prévu et dépensé, + imprévus ; dépensé seul après clôture) = marge ; en espèces : − charité 2,5 %, réinvestissement, dettes, provision (`g_*`, 0 % par défaut, retouchables en % ou MAD) puis 37,5 / 37,5 / 25 ; virement ou chèque : le reste reste dans Epicure. Sans réglage, agence, apporteur et « sur place » sont lus dans la note de l'appel vocal. Tables `parts_evt`, `parts_versements` (versements annulables, jamais effacés).
- **v77** : le code de connexion d'un associé ne se refait que par un associé (`compte_nouveau_code`), pas par un autre administrateur (Ghali est admin).
- **v78 · Timeline** (78a à 78d) : modèle `orga.timeline_modele` (25 lignes de départ en 4 blocs : avant J, jour J équipe, déroulé invités, après), Paramètres › Timeline (`src/timelineParam.jsx`). Chaque ligne : intitulé, jour J−30 à J+5, accroche début / fin / heure fixe / sans heure + décalage, durée, rôle (coordination, bar, cuisine, achats, production → personne de `equipe_defaut` ou de l'équipe de l'événement), type, « Généré quand », critique. Début et fin obligatoires à la création (`heure_debut`, `heure_fin`), timeline posée par `evenement_creer` ; l'agent vocal la pose aussi après le chiffrage (`timeline_action` 'generer' dans orga-voix). Lignes « auto », bougée à la main = « retouché ». Date ou horaires changés : bandeau Décaler / Laisser (`timeline_etat`, `timeline_action`). Événements existants : bouton « ⏱ Générer la timeline » sur leur planning.
- **v79, v80 · Barre du bas** : seule `.app` défile (position fixed, overflow auto), la page jamais ; recalage après le clavier (`src/main.jsx`) ; marge sous la barre réduite. **À confirmer sur l'iPhone de Salmane.**
- **v81 · Le coût qui bouge** (`supabase/81_cout_qui_bouge.sql`, test `tests/sql/cout_qui_bouge.sql` 11 / 11) : **seulement après signature** (`prix_signe`), une réponse propre au cadrage qui compte dans un poste (« Compté quand ? ») ou une correction de « Repris du devis » refait le chiffrage, **seulement les lignes de paramètre que la réponse touche** (`_cadrage_cout`, appelé par `cadrage_maj`, erreur rangée au journal sans bloquer la réponse). Pas les invités, la gamme ni la société. Le prix signé ne bouge jamais ; les enveloppes suivent tout de suite (hausse et baisse). Gardé et signalé : ligne 🔒, surcharge, effectif, personne nommée, bloc gardé, enveloppe corrigée à la main. Les réponses vont dans `chiffrages.base`, les valeurs du devis dans `base._avant_cadrage` (« Repris du devis » les montre, « corrigé » reste). Journal du chiffrage : source `cadrage` (« cadrage, après signature »). Salmane seul reçoit « Coût en hausse / en baisse » (famille enveloppes, code, écart, marge avant → après, réponses, lignes, 🔒 gardé, prix à régler) après `r_cout_calme` minutes sans nouvelle réponse (10, Paramètres › Marges › Coût après signature) : une séance = un message (`chiffrages.cout_annonce_le`). « Ton enveloppe change » attend le même calme. Nouvelle version du devis : Salmane passe par le devis comme avant. **Aucun poste n'utilise encore une question du cadrage dans « Compté quand ? »** : tant que Salmane n'en règle pas, seules les corrections du devis repris font bouger le coût.

## Où on en est (19/11)
- v81 sur la branche `v81-cout-qui-bouge`, captures envoyées ; fusion et mise en ligne de la migration 81 après le « oui » de Salmane. Dernière fusion : v80 (6afaf20).
- En attente d'un retour de Salmane : la barre du bas sur iPhone (v80) ; un premier appel test de l'agent vocal (Express, puis Challenge) ; un premier vrai cadrage avec les propositions de l'IA.
- **Le crédit de l'API Anthropic était épuisé** (« credit balance is too low », ×12 dans État de l'appli, copilote, 16/11) : le copilote et l'IA du cadrage échouent tant qu'il n'est pas rechargé. Le lui rappeler s'il voit des erreurs IA.
- Le mariage Kasbah Dif (EVT-2026-006, 17/11, espèces, 354 945 HT) est passé : sa clôture est à faire (solde, pièces, matériel, bilan).
- 8 prix « à régler » à remplir par Salmane dans Paramètres : kit bar, création de signature, shots, inventaire alcool, comptoir de bar, kit plonge, kit cuisine, cuisine complète.

## Reste à faire, dans l'ordre (un chantier = une version, questions puis maquettes)
1. **Option** : devis ouvert = date, personnes clés et matériel du dépôt bloqués, date limite, relance.
2. **Acompte** → statut Confirmé automatique.
3. **Enveloppes à −10 %** du coût.
4. **Check-list** (lignes du chiffrage + modèle par zone) et **attribution automatique** puis retouche.
5. **Rétroplanning** ajusté par chaque responsable (s'appuyer sur la timeline v78).
6. **Lien staff** : confirmation des extras par lien.
7. **Chargement et contacts** du jour J.
8. **Clôture** : conditions (solde, pièces, matériel, bilan).
- Plus tard : la gamme pilote aussi l'alcool, les ratios de staff et la vaisselle ; chronomètre « 10 minutes » ; ouvrir les notifications à toute l'équipe (`notifs.ouvert_equipe`).

## Pièges connus
- PL/pgSQL : une variable qui porte le nom d'une colonne ou d'un alias rend la requête « ambiguous » et **casse la fonction en production** (arrivé avec `_reponses`, corrigé en 72c). Nommer les alias autrement (`pz`, `aa`, `vid`).
- Un déclencheur qui teste `new.colonne` d'une seule table doit être écrit en `if … else …` imbriqués (sinon « record new has no field »).
- Appeler une fonction à argument `text` avec un littéral seul peut échouer (« malformed array literal ») : écrire `'EVT-…'::text`.
- `apply_migration` et `deploy_edge_function` prennent le contenu complet en texte : pour une fonction Edge, envoyer tout le fichier (et ses fichiers importés), jamais un extrait. Garder le fichier du dépôt identique à ce qui est déployé.
- `.app` est en position fixed : il crée un contexte d'empilement. Les feuilles (`Sheet`) sont dedans ; la barre `.tabs` doit rester dedans aussi (portée hors de `.app`, elle passait par-dessus les feuilles).
- Avant d'ajouter une classe CSS, vérifier qu'elle n'existe pas (`.cf-h` existait déjà, renommée `.cf-hr`).
- Playwright : `goto` sur le même hash ne remonte pas l'écran (passer par `about:blank`) ; attendre ~3,5 s qu'un toast disparaisse avant une capture.
- Les codes d'erreur SQL (`reserve_associes`, `reserve_editeur_parametres`…) doivent avoir leur phrase dans `src/erreurs.js` (un test le vérifie).
- Supabase ne rend jamais plus de 1 000 lignes d'un coup.
- Titre d'une notification : 28 caractères au plus (des tests le vérifient) ; le code de l'événement va au début du corps.
- `orga.evenements` a un déclencheur d'historique sur toute mise à jour (`t_hist`) : une donnée technique (ex. « dernier message envoyé ») va ailleurs, sinon l'historique se remplit (v81 la range dans `orga.chiffrages`).
