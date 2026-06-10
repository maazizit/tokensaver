# 🚀 Guide de publication TokenSaver

## Publication sur VS Code Marketplace

### Prérequis

1. **Compte Microsoft/Azure**
   - Créez un compte : https://dev.azure.com
   - Créez une organisation Azure DevOps

2. **Personal Access Token (PAT)**
   - Allez dans : https://dev.azure.com/[your-org]/_usersSettings/tokens
   - Cliquez "New Token"
   - Nom : `vsce-tokensaver`
   - Scopes : **Marketplace** → **Manage**
   - Copiez le token (vous ne le reverrez plus !)

3. **Publisher ID sur VS Code Marketplace**
   - Allez sur : https://marketplace.visualstudio.com/manage
   - Créez un publisher (ex: `maazizit`)
   - Vérifiez dans `package.json` : `"publisher": "maazizit"`

### Installation des outils

```bash
npm install -g @vscode/vsce
```

### Connexion

```bash
vsce login maazizit
# Entrez votre PAT quand demandé
```

### Publication

```bash
cd /Users/zahramaaziz/Desktop/wayfind

# Version actuelle (0.1.0)
vsce publish

# Ou avec bump de version
vsce publish minor  # 0.1.0 → 0.2.0
vsce publish patch  # 0.1.0 → 0.1.1
vsce publish major  # 0.1.0 → 1.0.0
```

### Vérification avant publication

```bash
# Vérifier que tout est OK
vsce ls

# Test du package
vsce package
code --install-extension tokensaver-0.1.0.vsix
```

## 📝 Checklist avant publication

- [ ] **README.md complet** avec captures d'écran
- [ ] **CHANGELOG.md** créé
- [ ] **Icon** (128x128 PNG) dans `media/icon.png`
- [ ] **Repository GitHub** créé et pushé
- [ ] **License** vérifiée (MIT OK)
- [ ] **Keywords** optimisés dans package.json
- [ ] **Category** correcte ("Machine Learning", "Visualization")
- [ ] **Screenshots/GIFs** du dashboard dans README
- [ ] **Tests** effectués (installer + utiliser)

## 📸 Ajouter des captures d'écran

Créez un dossier `media/screenshots/` :

```bash
mkdir -p media/screenshots
```

Ajoutez dans README.md :

```markdown
## Screenshots

### Dashboard
![Dashboard](media/screenshots/dashboard.png)

### Status Bar
![Status Bar](media/screenshots/statusbar.png)

### Installation
![Installation](media/screenshots/install.png)
```

## 🎥 Créer un GIF de démo

Utilisez **Kap** (macOS) ou **ScreenToGif** (Windows) :

1. Ouvrez VS Code
2. Lancez `TokenSaver: Show Dashboard`
3. Montrez le status bar
4. Lancez `TokenSaver: Install TokViz Compression`
5. Sauvegardez en `media/demo.gif`

Ajoutez dans README.md :

```markdown
![Demo](media/demo.gif)
```

## 📋 Créer CHANGELOG.md

```markdown
# Changelog

## [0.1.0] - 2026-06-10

### Added
- Initial release
- TokViz integration for token compression
- Visual dashboard with savings stats
- One-click hook installation for Cursor and Copilot
- Status bar widget showing live savings
- Doctor command to verify installation
- Compare agents feature

### Features
- Real-time token savings visualization
- Support for Cursor, GitHub Copilot, and Gemini CLI
- Enterprise mode (metrics only, no command logging)
- Automatic status bar updates every 30 seconds
```

## 🌐 Créer repository GitHub

```bash
cd /Users/zahramaaziz/Desktop/wayfind

# Initialiser git (si pas déjà fait)
git init
git add .
git commit -m "feat: TokenSaver v0.1.0 - TokViz visualization extension"

# Créer repo sur GitHub puis :
git remote add origin https://github.com/maazizit/tokensaver.git
git branch -M main
git push -u origin main
```

Mettez à jour `package.json` :
```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/maazizit/tokensaver.git"
  }
}
```

## 🎯 Description optimisée pour le Marketplace

**Title** (max 50 chars) :
```
TokenSaver - AI Token Compression & Analytics
```

**Short description** (max 200 chars) :
```
Save 30-70% AI tokens with TokViz compression. Real-time dashboard for Cursor, Copilot & Gemini. Visual analytics, one-click setup, status bar tracking.
```

**Tags/Keywords** (dans package.json) :
```json
"keywords": [
  "ai",
  "tokens",
  "copilot",
  "cursor",
  "gemini",
  "compression",
  "analytics",
  "cost-optimization",
  "tokviz",
  "context",
  "dashboard",
  "visualization"
]
```

## 🔄 Workflow de mise à jour

```bash
# 1. Faire vos modifications
# 2. Tester localement
npm run compile
npm run package
code --install-extension tokensaver-0.1.X.vsix

# 3. Commit
git add .
git commit -m "feat: nouvelle fonctionnalité"
git push

# 4. Publier nouvelle version
vsce publish patch
# ou
vsce publish minor
```

## 📊 Suivi des statistiques

Après publication, suivez vos stats sur :
https://marketplace.visualstudio.com/manage/publishers/maazizit

Vous verrez :
- Nombre d'installations
- Nombre de téléchargements
- Notes/avis des utilisateurs
- Tendances d'installation

## 🎯 Promotion

### 1. Reddit
- r/vscode
- r/cursor
- r/github (pour Copilot)

### 2. Twitter/X
```
🚀 Just released TokenSaver - a VS Code extension to save 30-70% of AI tokens!

✅ Visual dashboard
✅ One-click compression
✅ Works with Cursor, Copilot & Gemini

Powered by TokViz compression.

#VSCode #Cursor #Copilot #AI #DevTools
```

### 3. Dev.to / Medium
Article : "How I Reduced My AI Token Costs by 70% with TokenSaver"

### 4. GitHub
- Ajouter topic tags : `vscode-extension`, `cursor`, `copilot`, `ai-tools`
- Créer une release avec le VSIX attaché

## ⚠️ Important

### Ne pas oublier dans .vscodeignore

Créez `.vscodeignore` :
```
.vscode/**
.vscode-test/**
src/**
.gitignore
tsconfig.json
node_modules/**
*.vsix
.DS_Store
```

### Tester le package avant publication

```bash
# Voir ce qui sera inclus
vsce ls

# Vérifier la taille
ls -lh tokensaver-0.1.0.vsix
```

## 🎉 Après publication

1. **Partagez le lien** : https://marketplace.visualstudio.com/items?itemName=maazizit.tokensaver
2. **Demandez des reviews** à vos utilisateurs
3. **Répondez aux issues** rapidement
4. **Itérez** basé sur les retours

---

## 📝 Template de release note

Créez `.github/RELEASE_TEMPLATE.md` :

```markdown
## 🎉 Version X.X.X

### ✨ New Features
- Feature 1
- Feature 2

### 🐛 Bug Fixes
- Fix 1
- Fix 2

### 📚 Documentation
- Updated README
- Added examples

### 🔧 Improvements
- Performance improvements
- Better error messages

### 📦 Installation
\`\`\`bash
code --install-extension maazizit.tokensaver
\`\`\`

or download the VSIX from [releases](https://github.com/maazizit/tokensaver/releases)
```

---

**Vous êtes prêt à publier ! 🚀**
