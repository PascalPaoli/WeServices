# WeServices Metrics Daemon Architecture

## Problématique initiale
Le tableau de bord WeServices nécessitait l'affichage des métriques (CPU/RAM) des processus lancés. Cependant, étant donné que WeServices lance les commandes via des wrappers (comme `powershell.exe` ou `npm.cmd`), l'utilisation basique de bibliothèques Node (ou appels système simples sur le PID parent) retournait invariablement 0% de CPU et quelques mégaoctets de RAM.

La charge de travail réelle (ex: modèles d'IA, serveurs web) étant déportée dans des sous-processus profonds (comme `python.exe`, `node.exe`), il fallait une solution pour scanner l'arborescence complète des processus.
L'utilisation de scripts WMI (`Get-WmiObject`) a été écartée car WMI provoquait de graves lags et gels (freezes) du système d'exploitation lors de requêtes répétées.

## Solution : Démon Python avec `ctypes`
Afin de garantir des performances optimales sans impact sur l'expérience utilisateur, l'architecture suivante a été retenue :

1. **Démon Asynchrone Découplé** : Un script Python (`metrics_daemon.py`) est généré à la volée dans le dossier temporel de l'utilisateur (`%TEMP%`) par `index.ts`. Ce script tourne en boucle de manière autonome.
2. **Communication Inter-Processus par fichiers JSON** :
   - WeServices écrit les PIDs racines des services en cours d'exécution dans `weservices_pids.json`.
   - Le démon Python lit ce fichier en temps réel, calcule les métriques, et dépose le résultat dans `weservices_metrics.json`.
   - WeServices récupère ces résultats (non bloquant) et les transmet à l'interface (IPC).
3. **Pistage Ultra-Rapide via `ctypes`** : Le script Python court-circuite tout intermédiaire pour attaquer directement l'API native Windows. Il utilise `ctypes.windll.kernel32.CreateToolhelp32Snapshot` pour reconstituer l'intégralité de l'arborescence des processus enfants de manière fulgurante (latence de l'ordre de quelques millisecondes), sans aucun freeze WMI.

## Normalisation CPU 3C/Multithread
L'agrégation brutale des temps CPU (User + Kernel) des multiples threads d'un script lourd aboutissait à des pourcentages aberrants (ex: dépassant les 1000 % de charge rapportée).
Pour présenter une valeur pertinente pour l'utilisateur, la somme des deltas du temps CPU mesurés est divisée par le nombre de cœurs logiques (`os.cpu_count()`). Ainsi, si le processus tourne à fond sur 4 cœurs parmi 64 threads disponibles, WeServices affichera une charge globale réaliste proportionnée à la puissance totale de la machine (~6%).

## Option Désactivable par Défaut
Bien que ce système `ctypes` soit immensément plus performant que WMI, collecter les métriques matérielles demande tout de même des appels systèmes répétés (ici toutes les secondes).
Afin d'offrir une expérience Plug & Play inaltérée pour n'importe quel type de machine et d'utilisateur sur le dépôt GitHub, ces requêtes de télémesure poussées sont désactivées par défaut. Elles peuvent être activées ponctuellement via l'interface des **Préférences** (bouton d'engrenage > *Enable precise CPU/RAM metrics*).
