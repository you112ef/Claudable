# API Changes Summary

## Overview
This document summarizes the key changes made to the FastAPI backend between commits `8045acbeb5b045592ac409ada6d60e2c757d8402` and `2561b10cd01acdf7ec59028b4f0014c7758afefa`.

## 1. GitHub Integration Improvements

### File: `apps/api/app/api/github.py`

**Changes:**
- **Enhanced default branch handling**: Added logic to handle `null` default_branch values from GitHub for empty repositories
- **Branch normalization**: Ensures `default_branch` defaults to "main" when GitHub returns null
- **Post-push branch persistence**: After successful first push, stores the default_branch in service data

**Code Changes:**
```python
# Before
default_branch = connection.service_data.get("default_branch", "main")

# After  
default_branch = connection.service_data.get("default_branch") or "main"

# New logic added
if not data.get("default_branch"):
    data["default_branch"] = default_branch
```

**Impact:** Fixes issues with newly created GitHub repositories that don't have a default branch set initially.

## 2. Project Dependencies Management

### File: `apps/api/app/api/projects/crud.py`

**Changes:**
- **Enhanced documentation**: Added clearer comments for npm installation process
- **Code formatting improvements**: Better structure and error handling clarity

**Code Changes:**
```python
async def install_dependencies_background(project_id: str, project_path: str):
-    """Install dependencies in background"""
+    """Install dependencies in background (npm)"""
```

## 3. Vercel Deployment Branch Resolution

### File: `apps/api/app/api/vercel.py`

**Changes:**
- **Improved branch selection logic**: Prioritizes GitHub connection's last pushed branch over request branch
- **Enhanced deployment consistency**: Uses GitHub service data to maintain branch synchronization

**Code Changes:**
```python
# New preferred branch resolution logic
preferred_branch = (
    github_connection.service_data.get("last_pushed_branch")
    or github_connection.service_data.get("default_branch")
    or request.branch
    or "main"
)

# Updated deployment call
deployment_result = await vercel_service.create_deployment(
    project_name=vercel_data.get("project_name"),
    github_repo_id=github_repo_id,
-    branch=request.branch,
+    branch=preferred_branch,
    framework=vercel_data.get("framework", "nextjs")
)
```

**Impact:** Ensures Vercel deployments use the same branch that was last pushed to GitHub, preventing deployment/source code mismatches.

## 4. System Prompt Major Overhaul

### File: `apps/api/app/prompt/system-prompt.md`

**Major Additions:**

### 4.1 Next.js Path Handling Guidelines
- **Critical path rules**: Distinction between `app/page.tsx` (correct) vs `/app/page.tsx` (incorrect)
- **Structure detection**: Automatic detection of `app/` vs `src/app/` directory structures
- **Command efficiency**: Emphasis on single `ls -la` command for project analysis

### 4.2 Image Configuration Requirements
- **Next.js image domains**: Mandatory configuration of `remotePatterns` in `next.config.mjs`
- **External image handling**: Proper configuration for placeholder services (via.placeholder.com, picsum.photos)
- **Fallback strategies**: Use standard `<img>` tag when Next Image configuration is complex

### 4.3 Build Verification Process
- **Progressive error checking**: TypeScript → ESLint → Build sequence
- **Faster feedback loop**: `npx tsc --noEmit` for type checking before full builds
- **Stability requirements**: Use stable package versions, avoid beta/alpha dependencies

### 4.4 Enhanced Design Guidelines
- **Framer Motion**: Standardized animation library requirement
- **Accessibility focus**: WCAG AA contrast standards, proper ARIA labels
- **Text readability**: Restrictions on gradient text usage, minimum font sizes
- **Responsive design**: Mobile-first approach with Tailwind CSS

### 4.5 Development Workflow Improvements
- **Error handling**: Explicit guidance on when to use try/catch blocks
- **Debugging standards**: Extensive console.log usage for development
- **Component organization**: Preference for practical solutions over strict separation

## 5. CLI Adapter Enhancements

### 5.1 Codex CLI (`apps/api/app/services/cli/adapters/codex_cli.py`)

**New Environment Variable Controls:**
- **`CLAUDABLE_DISABLE_AGENTS_MD`**: Disables automatic AGENTS.md creation
- **`CLAUDABLE_CODEX_RESUME`**: Controls session resume functionality

**Code Changes:**
```python
# AGENTS.md creation control
if str(os.getenv("CLAUDABLE_DISABLE_AGENTS_MD", "")).lower() in ("1", "true", "yes", "on"):
    ui.debug("AGENTS.md auto-creation disabled by env", "Codex")
else:
    await self._ensure_agent_md(project_path)

# Session resume control
enable_resume = str(os.getenv("CLAUDABLE_CODEX_RESUME", "")).lower() in ("1", "true", "yes", "on")
```

**Impact:** Provides fine-grained control over Codex CLI behavior, allowing customization for different deployment environments.

### 5.2 Qwen CLI (`apps/api/app/services/cli/adapters/qwen_cli.py`)

**Enhanced File Operation Handling:**
- **Parameter validation**: Added validation for `old_string` parameter in edit requests
- **Error tolerance**: Returns success even with malformed requests to avoid blocking workflow
- **New request handlers**: Added support for `edit` and `str_replace_editor` requests

**Stderr Log Filtering:**
- **Noise reduction**: Filters out polling messages, ImportProcessor errors, and ENOENT warnings
- **Focused logging**: Only logs meaningful errors to reduce console noise

**Code Changes:**
```python
# Enhanced edit request handling
async def _edit_file(params: Dict[str, Any]) -> Dict[str, Any]:
    if "old_string" not in params:
        ui.warning(f"Qwen edit missing 'old_string': {path}", "Qwen")
        return {"success": True}  # Continue workflow despite errors

# Improved stderr filtering
if "polling for token" in decoded.lower():
    continue
if "[ERROR] [ImportProcessor]" in decoded:
    continue
if "ENOENT" in decoded and ("node_modules" in decoded or "tailwind" in decoded):
    continue
```

**Impact:** Improves Qwen CLI reliability and reduces log noise while maintaining workflow continuity.

## 6. Package Manager Normalization

### File: `apps/api/app/services/local_runtime.py`

**NPM Standardization:**
- **Mixed manager detection**: Automatically detects pnpm/yarn artifacts
- **Cleanup process**: Removes conflicting lock files and node_modules
- **NPM enforcement**: Ensures all projects use npm for consistency

**Dependency Installation Optimization:**
- **Hash-based change detection**: Only installs when package.json or package-lock.json changes
- **Performance improvement**: Avoids unnecessary reinstallations

**Code Changes:**
```python
# NPM normalization logic
pnpm_lock = os.path.join(repo_path, "pnpm-lock.yaml")
yarn_lock = os.path.join(repo_path, "yarn.lock")
pnpm_dir = os.path.join(repo_path, "node_modules", ".pnpm")
if os.path.exists(pnpm_lock) or os.path.exists(yarn_lock) or os.path.isdir(pnpm_dir):
    print("Detected non-npm artifacts (pnpm/yarn). Cleaning to use npm...")
    shutil.rmtree(os.path.join(repo_path, "node_modules"), ignore_errors=True)
```

**Impact:** Eliminates package manager conflicts and improves build reliability across projects.

## 7. Next.js Project Scaffolding

### File: `apps/api/app/services/filesystem.py`

**Changes:**
- **Enhanced comments**: Clarified that dependency installation is handled by backend
- **Process documentation**: Better explanation of the --skip-install flag usage

**Impact:** Improves code maintainability and understanding of the project creation flow.

---

# Migration Requirements for Next.js Backend

## Actual Current State Analysis

After reviewing the actual Next.js backend codebase, here are the **real migration requirements** based on what's currently implemented:

## 1. GitHub Branch Handling (HIGH PRIORITY)

**Current State:** 
- `pushToGithub()` in `packages/services/github/src/index.ts` hardcodes 'main' branch
- No logic to handle GitHub's default_branch or persist branch information

**Required Migration:**
```typescript
// Current implementation (line 68-90)
export async function pushToGithub(projectRepoPath: string, branch: string = 'main')

// Needs to be updated to:
export async function pushToGithub(projectId: string, projectRepoPath: string, branch?: string) {
  // Get GitHub connection to determine default branch
  const connection = await getGithubConnection(projectId);
  const serviceData = connection?.serviceData ? JSON.parse(connection.serviceData) : {};
  const defaultBranch = serviceData.default_branch || branch || 'main';
  
  // Existing push logic using defaultBranch...
  
  // After successful push, update service data
  if (connection) {
    const updatedData = {
      ...serviceData,
      last_push_at: new Date().toISOString(),
      last_pushed_branch: defaultBranch,
      default_branch: serviceData.default_branch || defaultBranch
    };
    // Update in database...
  }
}
```

**Files to Update:**
- `packages/services/github/src/index.ts`
- `apps/web/app/api/projects/[projectId]/github/push/route.ts`

## 2. Vercel Branch Resolution (HIGH PRIORITY)

**Current State:** 
- `createDeployment()` in `packages/services/vercel/src/index.ts` sends empty body
- No branch information passed to Vercel API

**Required Migration:**
```typescript
// Current implementation (line 58-70)
export async function createDeployment(projectId: string): Promise<...> {
  const res = await vFetch('/v13/deployments', { method: 'POST', body: JSON.stringify({}) })

// Needs to be updated to:
export async function createDeployment(projectId: string, branch?: string): Promise<...> {
  // Get GitHub connection data for branch resolution
  const prisma = await getPrisma();
  const githubConn = await (prisma as any).projectServiceConnection.findFirst({ 
    where: { projectId, provider: 'github' } 
  });
  
  const preferredBranch = branch || 
    (githubConn?.serviceData ? JSON.parse(githubConn.serviceData).last_pushed_branch : null) ||
    (githubConn?.serviceData ? JSON.parse(githubConn.serviceData).default_branch : null) ||
    'main';

  const res = await vFetch('/v13/deployments', { 
    method: 'POST', 
    body: JSON.stringify({ gitSource: { ref: preferredBranch } }) 
  });
```

**Files to Update:**
- `packages/services/vercel/src/index.ts`
- `apps/web/app/api/projects/[projectId]/vercel/deploy/route.ts`

## 3. Package Manager Normalization (MEDIUM PRIORITY)

**Current State:** 
- `packages/services/preview-runtime/src/index.ts` already has hash-based dependency optimization
- Only supports npm, no pnpm/yarn conflict detection

**Required Migration:**
Add npm normalization before dependency installation in `startPreviewInternal()`:

```typescript
// Add before line 191 (shouldInstallDeps check)
async function normalizeToNpm(repoPath: string): Promise<void> {
  const pnpmLock = path.join(repoPath, 'pnpm-lock.yaml');
  const yarnLock = path.join(repoPath, 'yarn.lock');
  const pnpmDir = path.join(repoPath, 'node_modules', '.pnpm');
  
  if (fs.existsSync(pnpmLock) || fs.existsSync(yarnLock) || fs.existsSync(pnpmDir)) {
    console.log('Detected non-npm artifacts (pnpm/yarn). Normalizing to npm...');
    try {
      await fsp.rm(path.join(repoPath, 'node_modules'), { recursive: true, force: true });
      if (fs.existsSync(pnpmLock)) await fsp.rm(pnpmLock);
      if (fs.existsSync(yarnLock)) await fsp.rm(yarnLock);
    } catch (e) {
      console.warn('Warning during npm normalization:', e);
    }
  }
}

// Use in startPreviewInternal before shouldInstallDeps
await normalizeToNpm(repoPath);
if (await shouldInstallDeps(repoPath)) { ... }
```

**Files to Update:**
- `packages/services/preview-runtime/src/index.ts`

## 4. CLI Environment Variables & Error Filtering (MEDIUM PRIORITY)

**Current State:** 
- Next.js has CLI adapters in `packages/services/cli/src/adapters/`
- Missing environment variable controls from FastAPI version
- Missing stderr filtering improvements

**Required Migration:**

### 4.1 Environment Variables Support
```typescript
// In packages/services/cli/src/adapters/registry.ts
// Add environment variable controls for Codex CLI

async function ensureAgentsMd(projectPath: string): Promise<void> {
  // Add CLAUDABLE_DISABLE_AGENTS_MD check
  if (process.env.CLAUDABLE_DISABLE_AGENTS_MD === '1') {
    console.log('AGENTS.md creation disabled by environment variable');
    return;
  }
  
  const agentPath = path.join(projectPath, 'AGENTS.md');
  // ... existing logic
}

// Add Codex resume control
const enableResume = process.env.CLAUDABLE_CODEX_RESUME === '1';
if (enableResume) {
  // ... existing resume logic
} else {
  console.log('Codex resume disabled (fresh session)');
}
```

### 4.2 Enhanced Error Filtering
```typescript
// In CLI adapters, add stderr filtering
function filterCliOutput(output: string): string {
  return output
    .split('\n')
    .filter(line => !line.toLowerCase().includes('polling for token'))
    .filter(line => !line.includes('[ERROR] [ImportProcessor]'))
    .filter(line => !(line.includes('ENOENT') && 
      (line.includes('node_modules') || line.includes('tailwind') || line.includes('supabase'))))
    .filter(line => line && !line.startsWith('DEBUG'))
    .join('\n');
}
```

## 5. What's Already Implemented ✅

The following items from the original diff **don't need migration**:
- **Hash-based dependency installation**: Already implemented in preview-runtime
- **CLI status checking**: Already working in Next.js backend
- **Project creation logic**: Already optimized
- **WebSocket integration**: Already implemented

## 6. Revised Priority Migration Order

### **Critical (affects core functionality):**
1. **GitHub branch handling** - Fixes hardcoded 'main' branch
2. **Vercel branch resolution** - Ensures deployments use correct branch

### **Important (improves reliability):**
3. **Package manager normalization** - Prevents npm/pnpm/yarn conflicts
4. **CLI environment variables & error filtering** - Improves CLI adapter reliability

### **Not Applicable:**
- System prompt validation (FastAPI-specific, applies to AI responses)

**Files to Update:**
- `packages/services/cli/src/adapters/registry.ts`
- `packages/services/cli/src/adapters/claude.ts` (if additional filtering needed)

## 5. System Prompt Integration (NOT APPLICABLE)

**Status:** The system prompt improvements in FastAPI are specific to AI model responses and validation rules. These don't apply to Next.js backend API routes since they handle different concerns (HTTP requests vs AI interactions).

## 6. Implementation Steps

1. **Update GitHub service** to handle dynamic branch resolution
2. **Update Vercel service** to pass branch information in deployment requests  
3. **Add npm normalization** to preview runtime before dependency installation
4. **Add CLI environment variables** and error filtering to CLI adapters
5. **Update API routes** to pass necessary parameters to services

## 7. Testing Requirements

After migration, test:
- Creating GitHub repos with non-'main' default branches
- Pushing to different branches and verifying Vercel deployments use same branch
- Projects with pnpm/yarn artifacts getting normalized to npm
- CLI environment variables working correctly
- CLI error filtering reducing noise in logs
- Existing functionality remains unbroken