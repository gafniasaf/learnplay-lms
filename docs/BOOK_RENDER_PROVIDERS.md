# Book Rendering Providers

Ignite Zero supports two render providers for book jobs (`book_render_jobs.render_provider`):

## Provider: `prince_local`

- **Where it runs**: inside your Docker worker container
- **Pros**:
  - Full control (fonts, resources, offline builds)
  - No external dependency at render time
  - Uses the same Prince engine as the managed services
- **Cons**:
  - You must install PrinceXML in the container (licensing + image build)
  - Heavier runtime requirements

### Required env (worker)

- `PRINCE_PATH` (optional; defaults to `prince` in PATH if not set)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `AGENT_TOKEN`

## Provider: `docraptor_api` (Optional)

DocRaptor is a managed service built on **PrinceXML**. The worker sends HTML to DocRaptor and receives the PDF output.

- **Pros**:
  - No Prince install/licensing in your container
  - Fast to operationalize
- **Cons**:
  - External dependency + network latency
  - API key management
  - You ship HTML outside your infra (data/privacy review required)

### Required env (worker)

- `DOCRAPTOR_API_KEY` (**required** when using `docraptor_api`)
- `DOCRAPTOR_TEST_MODE` (optional: `true|false`, default false)
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `AGENT_TOKEN`

## Switching Providers

`book-enqueue-render` accepts an optional `renderProvider`:

- `prince_local`
- `docraptor_api`

The value is stored on both `book_runs.render_provider` and `book_render_jobs.render_provider`.


