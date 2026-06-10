# TokenSaver - Quick Start Guide

## 🚀 Installation rapide

### Étape 1 : Installer TokViz CLI (requis)

TokViz est le moteur de compression. TokenSaver est l'interface visuelle.

```bash
# Option 1 : Via npm (recommandé)
npm install -g @tokviz/cli

# Option 2 : Depuis les sources
cd /Users/zahramaaziz/Desktop/tok-viz
pnpm install && pnpm build
pnpm link --global
```

Vérifiez l'installation :
```bash
tokviz --version
```

### Étape 2 : Installer l'extension TokenSaver

```bash
cd /Users/zahramaaziz/Desktop/wayfind
npm run package
code --install-extension tokensaver-0.1.0.vsix
```

### Étape 3 : Configurer la compression

Ouvrez VS Code et lancez :
```
Cmd+Shift+P → TokenSaver: Install TokViz Compression (Cursor)
```

Ou pour Copilot :
```
Cmd+Shift+P → TokenSaver: Install TokViz Compression (Copilot)
```

**⚠️ Redémarrez VS Code après l'installation des hooks**

### Étape 4 : Vérifier l'installation

```
Cmd+Shift+P → TokenSaver: Check Installation
```

Cela lance `tokviz doctor` pour vérifier que tout fonctionne.

### Étape 5 : Voir vos économies

Cliquez sur l'icône **💎 TokenSaver** dans la barre latérale ou :
```
Cmd+Shift+P → TokenSaver: Show Dashboard
```

## 📊 Comment ça marche ?

1. **Vous utilisez Cursor/Copilot normalement** (mode Agent)
2. **Quand l'agent exécute une commande shell** (git diff, npm test...)
3. **TokViz compresse l'output automatiquement** (50KB → 8KB)
4. **L'agent reçoit la version compressée** (économie de tokens)
5. **TokenSaver affiche les stats** dans le dashboard

## 🎯 Commandes disponibles

| Commande | Raccourci | Description |
|----------|-----------|-------------|
| `TokenSaver: Show Dashboard` | - | Ouvrir le tableau de bord |
| `TokenSaver: Check Installation` | - | Vérifier TokViz |
| `TokenSaver: View Statistics` | - | Stats détaillées (CLI) |
| `TokenSaver: Compare Agents` | - | Comparer Cursor vs Copilot |

## ⚙️ Configuration

Ouvrez Settings (`Cmd+,`) et cherchez "TokenSaver" :

```json
{
  // Chemin vers TokViz CLI (si pas dans PATH)
  "tokensaver.tokvizPath": "tokviz",
  
  // Agent par défaut
  "tokensaver.defaultAgent": "cursor",
  
  // Afficher la barre de statut
  "tokensaver.showStatusBar": true,
  
  // Mode entreprise (pas de log des commandes)
  "tokensaver.enterpriseMode": false,
  
  // Notifications sur grosses économies
  "tokensaver.notifyOnSavings": true
}
```

## 🔧 Dépannage

### "TokViz CLI not found"

Vérifiez que TokViz est installé :
```bash
which tokviz
tokviz --version
```

Si pas trouvé, installez avec :
```bash
cd /Users/zahramaaziz/Desktop/tok-viz
pnpm install && pnpm build
pnpm link --global
```

### Dashboard n'affiche pas de données

1. Vérifiez que vous utilisez **mode Agent** (pas le terminal manuel)
2. Vérifiez que `~/.tokviz/events.json` existe
3. Lancez une commande dans l'agent (ex: "run git status")
4. Attendez 30 secondes (refresh automatique)

### Hooks pas actifs

```bash
# Vérifier installation
tokviz doctor

# Réinstaller si nécessaire
tokviz init -g --agent cursor
```

## 📈 Exemples d'économies

| Commande | Avant | Après | Économie |
|----------|-------|-------|----------|
| `git diff` | 50KB (12.5K tokens) | 8KB (2K tokens) | 84% |
| `npm test` | 120KB (30K tokens) | 15KB (3.8K tokens) | 87% |
| `grep -r pattern` | 200KB (50K tokens) | 25KB (6.3K tokens) | 87% |

## 🎓 Prochaines étapes

1. **Utilisez votre agent normalement** pendant quelques jours
2. **Consultez le dashboard** régulièrement pour voir vos économies
3. **Comparez les agents** si vous utilisez Cursor ET Copilot
4. **Partagez avec votre équipe** pour économiser collectivement

---

**Questions ?** Ouvrez une issue sur [GitHub](https://github.com/maazizit/tokensaver)
