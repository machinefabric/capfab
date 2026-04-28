# CapFab

Standard capability and media spec definitions for the [CAPDAG](https://capdag.com) system.

CapFab is the canonical reference of what operations exist in the MachineFabric ecosystem and what data types they consume and produce. The definitions in [`standard/`](standard/) drive the live [capdag.com](https://capdag.com) registry.

## Contributing

Anyone can propose a new capability or media spec. There's no quality threshold — as long as a definition is well-formed, fills a real gap in the registry, and is documented clearly enough that other people can use it, we'll happily review and accept it. If you're unsure about any part of a submission, send it anyway and we'll work it out together.

| To do this | Open an issue using this template |
| --- | --- |
| Add a new capability | [Add Capability](../../issues/new?template=add-capability.yml) |
| Add a new media spec | [Add Media Spec](../../issues/new?template=add-media-spec.yml) |
| Remove a definition | [Remove Definition](../../issues/new?template=remove-definition.yml) |
| Edit an existing definition (typo, docs, metadata) | [Edit Existing Definition](../../issues/new?template=edit-definition.yml) |
| Report a bug, ask a question, propose a feature | [Bug / Feature / Question](../../issues/new?template=bug-or-feature.yml) |

Submissions are paste-the-JSON. Browse [`standard/`](standard/) and [`standard/media/`](standard/media/) for live examples of what we accept; the schemas are at [`cap.schema.json`](cap.schema.json) and [`media.schema.json`](media.schema.json).

We curate every submission by hand. There's no automated merge — a maintainer will read your issue, work with you on any rough edges, and once we're happy with the shape, the new definition appears here and on capdag.com.

## Layout

```
capfab/
├── cap.schema.json               JSON schema for capability definitions
├── media.schema.json             JSON schema for media spec definitions
└── standard/
    ├── *.json                    one file per capability
    ├── all-capabilities.json     combined manifest of every capability
    └── media/
        ├── *.json                one file per media spec
        └── all-media-specs.json  combined manifest of every media spec
```

Each capability JSON describes a single operation: its URN tags (notably `in` and `out` media URNs), its title and description, and any structured arguments it accepts. Each media spec describes a media URN's shape — its content type, profile, and any associated documentation.

## Using these definitions in code

Capability and media URNs are tagged URNs with directional matching semantics; they should be parsed and compared via the [`capdag`](https://www.npmjs.com/package/capdag) library, never by string. The `CapRegistryClient` and `MediaRegistryClient` in that library know how to load and resolve these definitions.

## Part of MachineFabric

CapFab is part of the [MachineFabric](https://machinefabric.com) project.
