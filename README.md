# CapFab definition proposals

CapFab is the public contribution inbox for capability and media definitions used by [CapDAG](https://capdag.com). It contains the submission templates and JSON schemas maintainers use to review proposed additions or changes.

The live registry—not this repository—is the reference for currently published definitions. Browse it on [capdag.com](https://capdag.com) when you need examples or want to confirm that a URN exists.

## Propose or discuss a definition

| Goal | Issue template |
| --- | --- |
| Add a capability or media definition | [Add definition](https://github.com/machinefabric/capfab/issues/new?template=add-definition.yml) |
| Report a problem, ask a question, or propose a change | [Definition feedback](https://github.com/machinefabric/capfab/issues/new?template=feedback-on-definitions.yml) |

Submit the proposed JSON in the issue. Capability submissions must validate against [`cap.schema.json`](cap.schema.json); media submissions must validate against [`media.schema.json`](media.schema.json). Explain the gap the definition fills, its intended inputs and outputs, and how it differs from neighboring published definitions.

Write documentation only for what is specific to the definition. Many published definitions are built along dims, such as a language, a file type or a quantisation, and each such definition names the dims and values it was built from in its `dims`. What a dim and each of its values mean is documented once, with the dim ([`dim.schema.json`](dim.schema.json) is its published shape), and every reader shows it beside the definition's own documentation. A submission does not write `dims` or restate what a dim says; the registry records which dims a published definition was built from.

Every submission is reviewed by a maintainer. There is no automatic merge or publication path. Accepted definitions are published to the versioned fabric registry and become visible on capdag.com.

## Repository reference

| Path | Purpose |
| --- | --- |
| `.github/ISSUE_TEMPLATE/` | Public proposal and feedback forms. |
| `cap.schema.json` | Schema for a capability-definition proposal. |
| `media.schema.json` | Schema for a media-definition proposal. |
| `dim.schema.json` | Schema of a published dim, which definitions name in their `dims`. |
| `version.txt` | Repository release version. |

Capability and media URNs are tagged values with directional matching semantics. Parse, normalize, and compare them with a CapDAG library; never route them with raw string manipulation.
