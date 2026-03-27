# Mission : Accès Sécurisé, Portabilité Web & Firebase Auth

## 🎯 Objectif
Transformer l'interface de WeServices (actuellement cantonnée à l'application bureau Electrobun) en une véritable application Web portable, accessible depuis n'importe quel navigateur (téléphone, PC distant). L'accès sera fermement sécurisé avec **Firebase Authentication** pour garantir que seul le propriétaire (ou les personnes autorisées) puisse piloter les processus locaux.

## 🏗️ Architecture Proposée

1.  **Portabilité de l'Interface Utilisateur (UI)**
    -   Par défaut, l'UI utilise le pont natif `rpc.request` propre à l'application bureau (Electrobun).
    -   Modification abstraite de la couche de transport : Si l'application détecte qu'elle est exécutée dans un navigateur classique, les boutons d'action (Start, Stop, Restart) basculent automatiquement sur les requêtes HTTP standard `fetch()` ciblant l'API `24206`.
2.  **Hébergement Statique via le Backend (Bun.serve)**
    -   Évolution de l'API `Bun.serve` existante sur le port `24206` : en plus des requêtes JSON `/api`, le serveur interceptent les requêtes (`/`, `/index.html`, `/assets/`) pour fournir directement le dossier de compilation Vite (`src/mainview/dist`).
3.  **Sécurité : Firebase Authentication**
    -   Mise en place très rapide d'un bouclier Firebase Auth.
    -   L'interface Web demandera obligatorily un login (Google ou Email) avant d'afficher le panel des services de contrôle WeServices.
    -   Les requêtes HTTP du frontend vers l'API 24206 incluront le token cryptographique (JWT) fourni par Firebase sous la forme `Authorization: Bearer <token>`.
4.  **Validation du Backend**
    -   L'API (Bun) de WeServices devra décoder le JWT Firebase via la clé publique Firebase pour vérifier son authenticité à chaque appel d'API provenant de l'exterieur.

---

## ✅ Liste des Tâches (Task List)

### Phase 1 : Rendre l'UI Portable (Agnostique d'Electrobun)
- [ ] Dans `src/mainview/main.ts`, créer une couche d'abstraction réseau `const rpcClient = { ... }`.
- [ ] Détecter la présence de `rpc.request` (l'app Bureau). Si absent, `rpcClient.startService` déclenchera un `fetch('/api/services/{id}/start')` et se nourrira des réponses JSON. Idem pour les requêtes de logs ou métriques.
- [ ] Gérer les requêtes d'affichage des logs (Actuellement poussées côté serveur par RPC, il faudra peut-être implémenter des Server-Sent Events (SSE) ou des Endpoints spécifiques pour la version HTTP Web).

### Phase 2 : Servir l'UI depuis le Backend
- [ ] Configurer `Bun.serve` (`src/bun/index.ts`) pour que toute requête non destinée à `/api` distribue les fichiers statiques HTML/JS/CSS contenus dans le dossier final compilé par Vite.

### Phase 3 : Intégrer Firebase Auth (Sécurité)
- [ ] Côté client (`mainview`) : Ajouter le SDK Firebase Web SDK CDN, l'initialisation du projet Firebase, et l'écran de Login/UI de base.
- [ ] Intercepter toutes les requêtes du module abstrait `rpcClient` pour inclure automatiquement le token d'identité généré.
- [ ] Côté serveur (`bun`) : Ajouter une validation simple par JWT pour tous les endpoints `/api`. Si le token est corrompu ou illégitime : Blocage 401.

### Phase 4 : Reverse Proxy & Accès (Optionnel)
- [ ] Exposer le port `24206` sur le routeur domestique ou adjoindre un reverse proxy standard Nginx.conf` type qui écoute sur `0.0.0.0:80` et proxy vers `127.0.0.1:24206`.
- [ ] Créer une route dans l'API WeServices pour instancier Nginx en tant que "Service Géré" directement depuis l'UI WeServices.

### Phase 4 : Tests & Déploiement
- [ ] Simulation d'appel distant via PowerShell sans clé (Vérifier Rejet 401 Unauthorized).
- [ ] Simulation d'appel distant via PowerShell avec clé (Vérifier 200 OK).
