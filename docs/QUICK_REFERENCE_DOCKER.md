# Docker Auto-Start Quick Reference

## Quick Commands

```powershell
# Check if Docker is running
npm run docker:check

# Start Docker if not running
npm run docker:start

# Test Docker auto-start functionality
npm run docker:test
```

## How It Works

The system automatically starts Docker Desktop when needed. You don't need to manually start Docker before running:

- `npm run setup`
- `npm run mcp:ensure`
- `npm run dev:up`

## What Happens

1. **Detection**: System checks if Docker daemon is running
2. **Location**: Finds Docker Desktop executable on your system
3. **Startup**: Starts Docker Desktop automatically if not running
4. **Wait**: Waits up to 2 minutes for Docker to become ready
5. **Progress**: Shows progress updates every 10 seconds

## Supported Platforms

| Platform | Auto-Start | Notes |
|----------|-----------|-------|
| Windows  | ✅ Yes    | Fully automatic |
| macOS    | ✅ Yes    | Fully automatic |
| Linux    | ❌ No     | Use `sudo systemctl start docker` |

## Troubleshooting

### Docker Won't Start

**Check Docker Desktop installation**:
```powershell
# Windows
Get-Command "Docker Desktop.exe" -ErrorAction SilentlyContinue

# Or check manually
Test-Path "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

**Manual start**:
1. Open Start Menu
2. Search for "Docker Desktop"
3. Click to start

### Timeout Error

If you see "Docker daemon did not start within timeout":

1. Check system resources (CPU/Memory)
2. Manually start Docker Desktop and check for errors
3. Restart your computer
4. Reinstall Docker Desktop if needed

### Permission Issues

Run PowerShell as Administrator if you see permission errors.

## Configuration

Default settings (in `scripts/utils/docker-starter.mjs`):

```javascript
DOCKER_STARTUP_TIMEOUT_MS = 120000  // 2 minutes
DOCKER_CHECK_INTERVAL_MS = 2000     // 2 seconds
```

## Programmatic Usage

```javascript
import { ensureDockerRunning, isDockerRunning } from './scripts/utils/docker-starter.mjs';

// Check status
if (isDockerRunning()) {
  console.log('Docker is ready!');
}

// Ensure running (auto-start)
const ready = await ensureDockerRunning();

// Check only (no auto-start)
const ready = await ensureDockerRunning({ autoStart: false });

// Silent mode
const ready = await ensureDockerRunning({ silent: true });
```

## Integration Points

Docker auto-start is integrated into:

- ✅ `npm run setup` - Initial system setup
- ✅ `npm run mcp:ensure` - MCP container management
- ✅ `npm run dev:up` - Development startup (via mcp:require)

## Testing

Test the feature:

```powershell
# Stop Docker Desktop manually first, then:

# Test standalone
npm run docker:start

# Test via setup
npm run setup

# Test via MCP
npm run mcp:ensure

# Run full test suite
npm run docker:test
```

## Related Documentation

- [DOCKER_AUTO_START.md](DOCKER_AUTO_START.md) - Full documentation
- [HOW_TO_RUN.md](../HOW_TO_RUN.md) - System startup guide
- [OPERATOR_MANUAL.md](OPERATOR_MANUAL.md) - Operator procedures

## Need Help?

1. Run `npm run docker:check` to see current status
2. Check `docs/DOCKER_AUTO_START.md` for detailed troubleshooting
3. Review error messages - they include actionable instructions
4. If all else fails, manually start Docker Desktop from Start Menu

