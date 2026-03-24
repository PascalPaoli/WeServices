# 🚀 WeServices Roadmap

Ce document rassemble les grandes évolutions prévues pour WeServices, ainsi que les tâches spécifiques pour chaque étape majeure du projet.

## 🐧 Epic : Intégration Native Systemd (Linux Desktop / Serveur)
**Objectif** : Faire évoluer WeServices d'un simple orchestrateur de processus enfants NodeJS vers une interface de pilotage complète s'appuyant sur le très robuste gestionnaire de services Linux `systemd`. 

Plutôt que de gérer les PIDs `bun spawn` manuellement et d'utiliser `taskkill` (l'approche Windows), WeServices déléguera l'exécution et le maintien en vie des services critiques à l'OS.

### 📋 Tâches (Tasks)

- [ ] **Phase 1 : Reconnaissance et Architecture**
  - [ ] Détecter automatiquement l'OS hôte (`os.platform() === 'linux'`).
  - [ ] Étudier les permissions nécessaires (user services via `systemctl --user`).
  - [ ] Définir une interface neutre dans `index.ts` pour que la création de services (Windows vs Linux) utilise le bon adaptateur en arrière-plan.

- [ ] **Phase 2 : Le Générateur d'Unités Systemd**
  - [ ] Créer une fonction qui génère des fichiers `.service` stricts (contenant le `WorkingDirectory`, le `ExecStart`, etc.) basés sur le profil du service local WeServices.
  - [ ] Gérer l'export automatique de ces fichiers dans `~/.config/systemd/user/`.

- [ ] **Phase 3 : Interface de Pilotage `systemctl`**
  - [ ] Remplacer les appels de la boucle "Start" par l'exécution de `systemctl --user start service_XYZ`.
  - [ ] Remplacer les appels de la boucle "Stop" par l'exécution de `systemctl --user stop service_XYZ` (zéro risque de zombies).
  - [ ] Remplacer la vérification d'état (ports/zombies) par un check ultra-fiable via `systemctl --user is-active service_XYZ`.

- [ ] **Phase 4 : Stream des Logs en Temps Réel (Journald)**
  - [ ] Remplacer la capture directe `stdout`/`stderr` du process Bun par l'ouverture d'un "stream" sur `journalctl --user -u service_XYZ -f -n 100`.
  - [ ] Assurer la mise à jour propre de l'UI Terminal sans fuite mémoire lorsqu'on passe d'un service à l'autre.

- [ ] **Phase 5 : Options Avancées UI (Bonus)**
  - [ ] Ajouter une option "Start on Boot" (Lancer au démarrage de la machine) qui exécutera silencieusement `systemctl --user enable service_XYZ`.
  - [ ] Gérer la stratégie de redémarrage (ex: `Restart=always` ou `on-failure` directement intégré lors de la génération du fichier `.service`).

---
_Note : L'interface graphique (Frontend), la base de données SQLite/JSON et le système RPC Electrobun resteront strictement les mêmes. Seul le "Moteur d'Orchestration" backend changera selon la plateforme !_
