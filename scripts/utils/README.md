# Scripts Utilities

Shared utility modules for Ignite Zero scripts.

## Docker Starter (`docker-starter.mjs` / `docker-starter.ts`)

Automatic Docker Desktop detection and startup utility.

### Features
- ✅ Detects if Docker daemon is running
- ✅ Automatically finds Docker Desktop executable
- ✅ Starts Docker Desktop if not running
- ✅ Waits for Docker daemon to become ready
- ✅ Cross-platform support (Windows, macOS, Linux)
- ✅ Configurable timeout and silent mode

### Usage

#### ESM (JavaScript)
```javascript
import { ensureDockerRunning, isDockerRunning } from './docker-starter.mjs';

// Check if Docker is running
if (isDockerRunning()) {
  console.log('Docker is ready!');
}

// Ensure Docker is running (auto-start if needed)
const ready = await ensureDockerRunning();
if (ready) {
  // Proceed with Docker operations
}

// Options
await ensureDockerRunning({
  autoStart: true,  // Auto-start Docker if not running (default: true)
  silent: false     // Suppress console output except errors (default: false)
});
```

#### TypeScript
```typescript
import { ensureDockerRunning, isDockerRunning, EnsureDockerOptions } from './docker-starter.js';

const options: EnsureDockerOptions = {
  autoStart: true,
  silent: false
};

const ready: boolean = await ensureDockerRunning(options);
```

### Integration Points

The Docker starter is used by:
- `scripts/setup.ts` - Initial system setup
- `scripts/mcp-ensure.mjs` - MCP container management
- `scripts/docker-start.mjs` - Standalone CLI tool

### Configuration

Constants in `docker-starter.mjs`:
```javascript
const DOCKER_STARTUP_TIMEOUT_MS = 120000;  // 2 minutes
const DOCKER_CHECK_INTERVAL_MS = 2000;     // 2 seconds
```

### Platform-Specific Behavior

#### Windows
- Searches for Docker Desktop in standard installation paths
- Detects if Docker Desktop process is already running
- Starts Docker Desktop using `cmd /c start`

#### macOS
- Uses `open -a Docker` to start Docker Desktop

#### Linux
- Auto-start not supported (Docker runs as system service)
- Provides instructions for manual start

### Error Handling

The utility handles:
- Docker Desktop not installed
- Docker Desktop not found in expected paths
- Startup timeout (daemon doesn't become ready)
- Permission issues
- Platform-specific failures

All errors are logged with actionable instructions.

### Testing

Test the Docker starter:
```bash
# Stop Docker Desktop manually, then:
npm run docker:start

# Or test programmatically:
node -e "import('./docker-starter.mjs').then(m => m.ensureDockerRunning())"
```

## Future Utilities

This directory will contain additional shared utilities as needed:
- Environment variable resolution
- Configuration file parsing
- Common validation functions
- Logging utilities
- etc.

