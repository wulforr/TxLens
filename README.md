# TxLens

Paste an EVM transaction hash. Get the call activity decoded, the token flows
diagrammed, and the gas accounted for.

Read-only. No wallet connection, ever.

- Design spec: [`docs/SPEC.md`](docs/SPEC.md)
- Working rules: [`CLAUDE.md`](CLAUDE.md)

## Development

```bash
pnpm install
pnpm dev
```

```bash
pnpm test        # vitest, no network
pnpm typecheck
pnpm lint
```

## Licence

MIT
