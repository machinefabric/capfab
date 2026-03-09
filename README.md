# Capgraph

Capability and media URN definitions for the CAPDAG system.

## What is Capgraph?

Capgraph contains the source definitions for capabilities and media types used in the MachineFabric ecosystem. These definitions specify what operations are available (caps) and what data types they work with (media URNs).

## Structure

```
capgraph/
├── src/
│   ├── caps/           # Capability definitions (TOML)
│   ├── media/          # Media type definitions (TOML)
│   ├── cap.schema.json # Schema for cap definitions
│   ├── media.schema.json # Schema for media definitions
│   └── capgraph.js     # Validation and export script
├── generated/          # Auto-generated JSON files
└── upload.sh           # Upload to capdag.com registry
```

## Usage

### Validate Definitions

```bash
npm run validate
```

This runs the full validation suite:
- Checks for duplicate URNs
- Validates against JSON schemas
- Detects generic caps that mask specific ones
- Cross-validates media URN references

### List URNs

```bash
npm run list-urns    # List all cap and media URNs
npm run list-caps    # List caps with their media dependencies
```

### Export Graph

```bash
npm run export-graph  # Export DOT format to stdout
npm run render-graph  # Render to PNG (requires graphviz)
```

### Upload to Registry

```bash
# Set your admin key in .env
export ADMIN_PASSWORD="your-admin-key"

# Upload
npm run upload
```

## Adding New Definitions

### Capabilities

Create a new `.toml` file in `src/caps/`:

```toml
title = "My Capability"
description = "What it does"
command = "my-command"

[urn.tags]
op = "my_operation"
in = "media:input-type"
out = "media:output-type"
```

### Media Types

Create a new `.toml` file in `src/media/`:

```toml
[spec]
urn = "media:my-type;tag1;tag2"
title = "My Type"
description = "What this media type represents"
```

## Part of MachineFabric

Capgraph is part of the [MachineFabric](https://machinefabric.com) project.
