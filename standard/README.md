# CAPDAG Standard Capabilities

This directory contains the standard capability definitions for the CAPDAG registry.

## Files

- `cap.schema.json` - JSON schema for validating capability definitions
- `*.toml` - TOML files defining standard capabilities
- `load-standards.js` - Script to load, validate, and export TOML files
- `generated/` - Auto-generated JSON files and upload scripts

## Standard Capabilities

The following standard capabilities are defined:

1. **extract-metadata** (`cap:op=extract;target=metadata`)
   - Extract document metadata including title, author, creation date, etc.

2. **extract-outline** (`cap:op=extract;target=outline`) 
   - Extract document outline/table of contents with hierarchical structure

3. **grind** (`cap:op=extract;target=pages`)
   - Extract structured page content from documents

4. **generate-thumbnail** (`cap:op=generate;output=binary;target=thumbnail`)
   - Generate thumbnail image previews of documents

## Usage

### Validate and Export Standards
```bash
node load-standards.js
```

This will:
1. Load all TOML files
2. Validate them against the JSON schema  
3. Export JSON files to `generated/`
4. Create an upload script

### Upload to Registry
```bash
# Set environment variable
export CAPDAG_ADMIN_KEY="your-admin-key"

# Run generated upload script
node generated/upload-standards.js
```

Or use the convenience script from the project root:
```bash
./upload-standards.sh
```

### Reset Registry via API
The registry also supports resetting via the admin panel or API:

```bash
curl -X POST https://capdag.com/api/admin/reset \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## TOML Format

Each capability is defined in TOML format following this structure:

```toml
description = "Capability description"
command = "command-name"
stdin = "media:pdf;bytes"  # Media URN for stdin. Omit if cap doesn't accept stdin.

[urn.tags]
action = "extract"
target = "metadata"

[[arguments.required]]
name = "file_path"
arg_type = "string"
description = "Path to the document file"
cli_flag = "file_path"
position = 0

    [arguments.required.validation]
    pattern = "^[^\\0]+$"
    min_length = 1

[[arguments.optional]]
name = "output"
arg_type = "string"
description = "Output file path"
cli_flag = "--output"

[output]
output_type = "object"
description = "JSON metadata object"
content_type = "application/json"
schema_ref = "metadata-schema.json"
```

## Validation

All TOML files are validated against `cap.schema.json` which ensures:

- Required fields are present
- Argument types are valid
- Tag names follow naming conventions
- Output specifications are correct

## Schema Updates

When updating the JSON schema:

1. Update `cap.schema.json`
2. Update corresponding TOML files
3. Run `node load-standards.js` to validate
4. Upload changes to registry

## Adding New Standards

1. Create a new `.toml` file following the naming convention
2. Define the capability following the TOML format
3. Run validation: `node load-standards.js`
4. Upload to registry if valid