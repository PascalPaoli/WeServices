# Prompt : Implémentation de la fonctionnalité "Restart App" (WeServices)

**Contexte du projet :**
L'application *WeServices* est une interface bureau construite avec **Bun**, **Vite** (React/Vanilla JS) et le framework **Electrobun**.
Elle gère le lancement et la supervision de multiples services/sous-processus en tâche de fond (scripts Python, serveurs Node, exécutables locaux, etc.) via des wrappers comme `powershell.exe` ou `npm`.
Récemment, nous avons implémenté une fermeture 100% propre de l'application (Bouton "Quit App" avec modal "*Shutting Down WeServices*"), qui itère dynamiquement sur l'arbre de processus (PID) de chaque service pour nettoyer les processus zombies via une fonction de kill agressive de Windows (`Get-WmiObject / taskkill /T /F`), puis appelle `process.exit(0)`.

**Objectif de la tâche :**
Je souhaite ajouter un nouveau bouton **"Restart App"** à côté du bouton "Quit App" dans l'en-tête global de l'interface (`main.ts`).
Ce bouton doit permettre de redémarrer intégralement l'application WeServices (le `launcher.exe` ou le processus Electrobun en cours).

**Cahier des charges et contraintes :**
1. **Interface (Frontend `main.ts`)** : 
   - Ajouter un bouton "Restart App" (utiliser une icône de rafraîchissement/reboot).
   - Lors du clic, afficher un overlay modal similaire au shutdown (ex: *"Restarting WeServices..."* avec une barre de progression ou animation).
   - Déclencher un appel RPC `restartApp` vers le backend.
2. **Backend (Bun `index.ts`)** :
   - Écouter l'appel RPC `restartApp`.
   - Boucler d'abord sur tous les services actifs (`processes` dict) pour déclencher l'extinction sécurisée (fonction `stopService` existante ou `kill` récursif enfant) afin de **ne laisser aucun processus zombie derrière nous**.
   - Une fois l'arbre de PIDs assaini, exécuter une commande de redémarrage.
   - Idéalement, utiliser un script PowerShell détaché (ou une fonction native Electrobun/Bun de `relaunch`) qui attend la mort du processus principal pour relancer l'exécutable (`launcher.exe`).
3. **Cas de figure `EACCES`** : S'assurer que le script de redémarrage libère le verrou système Windows sur les processus `bun.exe` afin d'éviter les `permission denied`.

**Fichiers concernés :**
- Frontend : `src/mainview/main.ts` (ou équivalent UI).
- Backend : `src/bun/index.ts` (pour l'appel RPC et le script de redémarrage).
- Autre : Création potentielle d'un fichier `.bat` ou d'une routine PowerShell détachée.

Agis en tant que développeur expert. Propose-moi une implémentation logicielle étape par étape, en commençant par le code de l'interface (HTML/TypeScript) puis la logique de redémarrage back-end.
