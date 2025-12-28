# Docker Desktop Auto-Start

## Overview

Ignite Zero now automatically starts Docker Desktop when it's not running. This eliminates the manual step of starting Docker before running the system.

## How It Works

The system includes a Docker auto-starter utility that:

1. **Detects** if Docker daemon is running
2. **Locates** Docker Desktop executable on your system
3. **Starts** Docker Desktop automatically if not running
4. **Waits** for the Docker daemon to become ready (up to 2 minutes)
5. **Reports** progress and status

## Supported Platforms

- ✅ **Windows** - Fully supported with automatic detection
- ✅ **macOS** - Fully supported
- ⚠️ **Linux** - Manual start required (Docker daemon typically runs as a service)

## Integration Points

The Docker auto-starter is integrated into:

### 1. Setup Script (`npm run setup`)
When running initial setup, Docker will be automatically started if needed.

### 2. MCP Ensure Script (`npm run mcp:ensure`)
Before starting the MCP container, Docker will be automatically started if needed.

### 3. Standalone CLI Tool
You can manually check or start Docker:

```powershell
# Start Docker if not running
npm run docker:start

# Just check Docker status (no auto-start)
npm run docker:check
```

## Windows-Specific Details

### Docker Desktop Detection
The system searches for Docker Desktop in these locations:
- `C:\Program Files\Docker\Docker\Docker Desktop.exe`
- `%PROGRAMFILES%\Docker\Docker\Docker Desktop.exe`
- `%LOCALAPPDATA%\Docker\Docker Desktop.exe`

### Process Detection
The system can detect if Docker Desktop is already starting up (process running but daemon not ready yet) and will wait for it to complete.

### Startup Method
Docker Desktop is started using:
```powershell
cmd /c start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

This runs Docker Desktop detached in the background.

## Configuration

### Timeout Settings
- **Startup Timeout**: 120 seconds (2 minutes)
- **Check Interval**: 2 seconds
- **Progress Updates**: Every 10 seconds

These can be adjusted in `scripts/utils/docker-starter.mjs` if needed.

### Auto-Start Behavior
By default, auto-start is **enabled**. You can disable it programmatically:

```javascript
import { ensureDockerRunning } from './scripts/utils/docker-starter.mjs';

// Disable auto-start (only check)
const running = await ensureDockerRunning({ autoStart: false });

// Silent mode (suppress console output except errors)
const running = await ensureDockerRunning({ silent: true });
```

## Troubleshooting

### Docker Desktop Not Found
**Error**: `Docker Desktop executable not found`

**Solution**: 
1. Verify Docker Desktop is installed
2. Check installation path matches expected locations
3. Install from: https://www.docker.com/products/docker-desktop/

### Startup Timeout
**Error**: `Docker daemon did not start within timeout`

**Possible Causes**:
- System resources (CPU/Memory) are constrained
- Docker Desktop is stuck or corrupted
- WSL2 issues (Windows)

**Solutions**:
1. Manually start Docker Desktop and check for errors
2. Restart your computer
3. Reinstall Docker Desktop
4. On Windows: Check WSL2 is properly configured

### Permission Issues
**Error**: `Failed to start Docker Desktop`

**Solution**:
- Ensure you have permission to run Docker Desktop
- On Windows: Run terminal as Administrator if needed

### Linux Systems
On Linux, Docker typically runs as a system service. Start it manually:

```bash
# Start Docker daemon
sudo systemctl start docker

# Enable Docker to start on boot
sudo systemctl enable docker
```

## Development

### File Structure
```
scripts/
├── utils/
│   ├── docker-starter.mjs    # ESM version (for scripts)
│   └── docker-starter.ts     # TypeScript version (for imports)
├── docker-start.mjs          # Standalone CLI tool
├── setup.ts                  # Uses Docker auto-starter
└── mcp-ensure.mjs            # Uses Docker auto-starter
```

### API Reference

#### `isDockerRunning(): boolean`
Check if Docker daemon is currently running.

```javascript
import { isDockerRunning } from './scripts/utils/docker-starter.mjs';

if (isDockerRunning()) {
  console.log('Docker is ready!');
}
```

#### `ensureDockerRunning(options): Promise<boolean>`
Ensure Docker is running, optionally starting it if needed.

**Options**:
- `autoStart` (boolean, default: `true`) - Automatically start Docker if not running
- `silent` (boolean, default: `false`) - Suppress console output except errors

**Returns**: `Promise<boolean>` - `true` if Docker is running, `false` otherwise

```javascript
import { ensureDockerRunning } from './scripts/utils/docker-starter.mjs';

// Auto-start with progress output
const ready = await ensureDockerRunning();

// Check only (no auto-start)
const ready = await ensureDockerRunning({ autoStart: false });

// Silent mode
const ready = await ensureDockerRunning({ silent: true });
```

## Testing

Test the Docker auto-starter:

```powershell
# Stop Docker Desktop manually first, then:

# Test standalone CLI
npm run docker:start

# Test via setup script
npm run setup

# Test via MCP ensure
npm run mcp:ensure
```

## Future Enhancements

Potential improvements:
- [ ] Configurable timeout via environment variable
- [ ] Retry logic for transient failures
- [ ] Health check for Docker Desktop (not just daemon)
- [ ] Support for Docker Engine (non-Desktop) on Linux
- [ ] Integration with system tray notifications
- [ ] Graceful shutdown integration

## Related Documentation

- [HOW_TO_RUN.md](../HOW_TO_RUN.md) - System startup guide
- [OPERATOR_MANUAL.md](OPERATOR_MANUAL.md) - Operator procedures
- [TeamManual.md](TeamManual.md) - Team onboarding guide

