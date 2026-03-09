# Cap Chains: Technical Documentation

## Overview

Cap chains provide a mechanism for composing capabilities (caps) into execution pipelines that transform data from one media type to another. A cap chain is a directed acyclic graph (DAG) where each node is either a cap execution, a control flow node (fan-out/fan-in), or an input/output slot.

This document describes the architecture, current implementation state, and remaining work.

---

## Core Concepts

### Capabilities (Caps)

A capability is a discrete unit of functionality that:
- Accepts input of a specific media type (declared in the `in` tag of its URN)
- Produces output of a specific media type (declared in the `out` tag of its URN)
- Has typed arguments with optional defaults
- May accept stdin data (declared via optional `stdin` field)

**Cap URN Format:**
```
cap:in="media:pdf;bytes";op=generate_thumbnail;out="media:png;bytes"
```

### Media URNs

Media URNs describe data types using tagged URN syntax. Tags convey semantic information:
- `bytes` - Binary data marker
- `textable` - Can be represented as text
- `record` - Key-value map
- `list` - list of items
- `form=scalar` - Single value
- `numeric` - Numeric type

**Examples:**
```
media:pdf;bytes           # Binary PDF file
media:textable  # Single string value
media:integer  # Integer
media:file-path;textable  # Filesystem path (special handling)
media:png;bytes;list  # Array of PNG images
```

### File-Path Media URN

Arguments that represent filesystem paths use `media:file-path;textable` (or `file-path-array` for arrays). The system identifies these arguments by their media URN type, not by argument name.

**Constants defined in capdag:**
```rust
pub const MEDIA_FILE_PATH: &str = "media:file-path;textable";
pub const MEDIA_FILE_PATH_ARRAY: &str = "media:file-path;textable;list";
```

**Detection methods on `MediaUrn`:**
```rust
impl MediaUrn {
    pub fn is_file_path(&self) -> bool { self.type_name() == Some("file-path") }
    pub fn is_file_path_array(&self) -> bool { self.type_name() == Some("file-path-array") }
    pub fn is_any_file_path(&self) -> bool { self.is_file_path() || self.is_file_path_array() }
}
```

---

## Argument Binding System

### CapInputFile

Input files presented to caps are abstracted through `CapInputFile`:

```rust
pub struct CapInputFile {
    pub file_path: String,
    pub media_urn: String,
    pub metadata: Option<CapFileMetadata>,
    pub source_id: Option<String>,
    pub source_type: Option<SourceEntityType>,
    pub tracked_file_id: Option<String>,
    pub security_bookmark: Option<Vec<u8>>,
    pub original_path: Option<String>,
}
```

Caps never see domain entities (listings, chips, blocks) directly. They receive files with paths and media URNs.

### ArgumentBinding

Specifies how a cap argument gets its value:

```rust
pub enum ArgumentBinding {
    /// Path from current input file
    InputFilePath,

    /// Value from previous node's output
    PreviousOutput {
        node_id: String,
        output_field: Option<String>,
    },

    /// Literal JSON value
    Literal(serde_json::Value),

    /// Use cap's default value
    CapDefault,

    /// User-provided value at execution time
    Slot { name: String, schema: serde_json::Value },

    /// Setting from user preferences
    CapSetting { setting_key: String },
}
```

### ArgumentResolution

Determines how each argument will be resolved during plan building:

```rust
pub enum ArgumentResolution {
    FromInputFile,       // Auto-resolved from input file (file-path args, step 0)
    FromPreviousOutput,  // Auto-resolved from previous cap output (file-path args, step 1+)
    HasDefault,          // Has a default value in cap definition
    RequiresUserInput,   // Must be provided by user (no default, required)
}
```

---

## Execution Plan Structure

### CapExecutionPlan

The execution plan is a DAG with typed nodes:

```rust
pub struct CapExecutionPlan {
    pub name: String,
    pub nodes: HashMap<NodeId, CapNode>,
    pub edges: Vec<CapEdge>,
    pub entry_nodes: Vec<NodeId>,
    pub output_nodes: Vec<NodeId>,
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}
```

### Node Types

```rust
pub enum ExecutionNodeType {
    /// Execute a single cap
    Cap {
        cap_urn: String,
        arg_bindings: ArgumentBindings,
    },

    /// Input slot for user-provided files
    InputSlot {
        slot_name: String,
        expected_media_urn: String,
        cardinality: InputCardinality,
    },

    /// Output terminal node
    Output {
        output_name: String,
        source_node: NodeId,
    },

    /// Fan-out: execute body for each item in sequence
    ForEach {
        input_node: NodeId,
        body_entry: NodeId,
        body_exit: NodeId,
    },

    /// Fan-in: collect outputs into sequence
    Collect {
        input_nodes: Vec<NodeId>,
    },

    /// Merge parallel branches
    Merge {
        input_nodes: Vec<NodeId>,
        merge_strategy: MergeStrategy,
    },

    /// Split to multiple paths
    Split {
        input_node: NodeId,
        output_count: usize,
    },
}
```

### Cardinality

```rust
pub enum InputCardinality {
    Single,    // Exactly 1 item
    Sequence,  // Array of items (from sequence tag in media URN)
}
```

---

## Plan Building

### CapPlanBuilder

The plan builder constructs execution plans from source/target media specifications:

```rust
impl CapPlanBuilder {
    /// Find path and build plan
    pub async fn build_plan(
        &self,
        source_media: &str,
        target_media: &str,
        input_files: Vec<CapInputFile>,
    ) -> Result<CapExecutionPlan>

    /// Build plan from pre-selected path
    pub async fn build_plan_from_path(
        &self,
        name: &str,
        path: &CapChainPathInfo,
        input_cardinality: InputCardinality,
    ) -> Result<CapExecutionPlan>
}
```

### CapChainInfo

Internal structure holding both cardinality analysis and file-path argument information:

```rust
struct CapChainInfo {
    cardinality: CapCardinalityInfo,
    file_path_arg_name: Option<String>,
}
```

The `file_path_arg_name` is determined by media URN type matching (`is_any_file_path()`), not by argument name convention.

### Path Finding

Uses BFS to find shortest path through the cap graph:

1. Build adjacency list from registered caps (input type → output type)
2. Search from source media type to target media type
3. Return ordered list of cap URNs

### Cardinality Analysis

For each cap in the path:
1. Extract input and output cardinality from media URN tags
2. Determine if fan-out/fan-in is required
3. Generate appropriate execution nodes

**Cardinality transitions:**
- Single → Single: Direct execution
- Single → Sequence: One cap produces multiple outputs
- Sequence → Single: Fan-out with per-item execution
- Sequence → Sequence: Parallel processing

---

## Argument Resolution During Plan Building

### File-Path Argument Detection

The plan builder finds file-path arguments by media URN type:

```rust
fn find_file_path_arg(cap: &capdag::Cap) -> Option<String> {
    // Check required arguments
    for arg in &cap.arguments.required {
        if let Ok(urn) = capdag::MediaUrn::from_string(&arg.media_urn) {
            if urn.is_any_file_path() {
                return Some(arg.name.clone());
            }
        }
    }
    // Then check optional arguments
    for arg in &cap.arguments.optional {
        if let Ok(urn) = capdag::MediaUrn::from_string(&arg.media_urn) {
            if urn.is_any_file_path() {
                return Some(arg.name.clone());
            }
        }
    }
    None
}
```

### Resolution Logic

The `determine_resolution` function checks media URN type:

```rust
fn determine_resolution(
    &self,
    media_urn: &str,
    step_index: usize,
    is_required: bool,
    default_value: &Option<serde_json::Value>,
) -> ArgumentResolution {
    let is_file_path_type = if let Ok(urn) = capdag::MediaUrn::from_string(media_urn) {
        urn.is_any_file_path()
    } else {
        false
    };

    if is_file_path_type {
        if step_index == 0 {
            return ArgumentResolution::FromInputFile;
        } else {
            return ArgumentResolution::FromPreviousOutput;
        }
    }

    // Non-file-path arguments follow different resolution
    if default_value.is_some() {
        ArgumentResolution::HasDefault
    } else if is_required {
        ArgumentResolution::RequiresUserInput
    } else {
        ArgumentResolution::HasDefault  // Optional without default = implicit None
    }
}
```

---

## stdin Handling

### Declaration

Caps declare stdin acceptance via the `stdin` field:

```toml
stdin = "media:pdf;bytes"
```

If present, the cap accepts stdin of that media type. If absent, the cap does not accept stdin.

### Plugin vs Provider Distinction

For stdin data delivery:

- **Providers** (in-process): Read file bytes and pass via `stdin_data`
- **Plugins** (via gRPC/XPC): Send file reference (`StdinSource::FileReference`) to avoid 4MB gRPC limit

```rust
pub enum StdinSource {
    /// Raw bytes (for providers)
    Data(Vec<u8>),

    /// File reference (for plugins)
    FileReference {
        tracked_file_id: String,
        original_path: String,
        security_bookmark: Vec<u8>,
        media_urn: String,
    },
}
```

The Swift/XPC side uses `FileLifecycleManager` to resolve file references and read files locally.

---

## Cap Definition Format

### TOML Format

Cap definitions use TOML:

```toml
# generate-thumbnail-pdf.toml

title = "Generate PDF Thumbnail"
cap_description = "Generate a thumbnail image preview of the PDF"
command = "generate-thumbnail"
stdin = "media:pdf;bytes"

[urn.tags]
op = "generate_thumbnail"
in = "media:pdf;bytes"
out = "media:png;bytes"

[[arguments.required]]
name = "file_path"
media_urn = "media:file-path;textable"
arg_description = "Path to the PDF file to process"
cli_flag = "file_path"
position = 0

    [arguments.required.validation]
    pattern = "^[^\\0]+$"
    min_length = 1

[[arguments.optional]]
name = "width"
media_urn = "media:integer"
arg_description = "Width of the thumbnail in pixels"
cli_flag = "--width"
default_value = 200

    [arguments.optional.validation]
    min = 50.0
    max = 2000.0

[output]
media_urn = "media:png;bytes"
output_description = "PNG image representing a thumbnail of the PDF"
```

### Key Points

1. File-path arguments use `media:file-path;textable`
2. The `position` field determines positional argument order
3. `cli_flag` specifies how to pass the argument to CLI tools
4. `stdin` field (if present) specifies expected stdin media type

---

## Interpreter Execution

### Execution Flow

1. Parse execution plan
2. Compute topological order
3. Execute nodes in order:
   - **InputSlot**: Initialize with provided input files
   - **Cap**: Resolve bindings, call cap, store output
   - **ForEach**: Iterate over sequence, execute body for each
   - **Collect**: Gather outputs into sequence
   - **Output**: Mark terminal output

### Argument Resolution Context

```rust
pub struct ArgumentResolutionContext<'a> {
    pub input_files: &'a [CapInputFile],
    pub current_file_index: usize,
    pub previous_outputs: &'a HashMap<String, serde_json::Value>,
    pub plan_metadata: Option<&'a HashMap<String, serde_json::Value>>,
    pub cap_settings: Option<&'a HashMap<String, serde_json::Value>>,
    pub slot_values: Option<&'a HashMap<String, serde_json::Value>>,
}
```

### Binding Resolution

```rust
pub fn resolve_binding(
    binding: &ArgumentBinding,
    context: &ArgumentResolutionContext,
    cap_urn: &str,
    default_value: Option<&serde_json::Value>,
) -> Result<ResolvedArgument>
```

Resolution depends on binding type:
- `InputFilePath`: `context.current_file().file_path`
- `PreviousOutput`: `context.previous_outputs[node_id][field]`
- `Literal`: Use the literal value directly
- `CapDefault`: Use the provided default value
- `Slot`: Look up in `context.slot_values`

---

## CAPDAG Language Implementations

The cap specification system is implemented in multiple languages:

### capdag (Rust)
- Reference implementation
- Defines `Cap`, `CapUrn`, `MediaUrn`, `TaggedUrn`
- All other implementations mirror this

### capdag-js (JavaScript/TypeScript)
- NPM package
- Used in browser admin UI and Node.js tools

### capdag-go (Go)
- Used in Go services
- Mirrors Rust implementation

### capdag-objc (Objective-C)
- Framework for Swift/macOS
- Used by machfab-mac via MachineFabricSDK

All implementations must:
- Parse and validate cap definitions identically
- Handle media URN tag detection (`isBinary()`, `isJSON()`, `isText()`, `is_file_path()`)
- Use tagged-urn parsing, never string comparison for URN operations

---

## Current Implementation Status

### Completed

1. **File-path argument detection by media URN type**
   - Added `MEDIA_FILE_PATH` and `MEDIA_FILE_PATH_ARRAY` constants
   - Added `is_file_path()`, `is_file_path_array()`, `is_any_file_path()` methods to `MediaUrn`
   - Updated all 22+ cap TOML definitions to use `media:file-path;textable`
   - Updated plan builder to find file-path arguments by media URN type, not name

2. **CapChainInfo structure**
   - Combines cardinality analysis with file-path argument name
   - Used throughout plan building functions

3. **Plan builder functions updated**
   - `build_linear_plan`: Uses file-path arg names from `CapChainInfo`
   - `build_fan_out_plan`: Uses file-path arg names from `CapChainInfo`
   - `build_plan_from_analysis`: Passes `CapChainInfo` to sub-functions
   - `build_plan_from_path`: Now async, looks up cap definitions to find file-path args
   - `get_cap_chain_info`: Returns `Vec<CapChainInfo>` with both cardinality and arg info

4. **CapChainStepInfo updated**
   - Added `file_path_arg_name: Option<String>` field
   - Populated during plan building

5. **stdin architecture**
   - `stdin` field replaces `accepts_stdin` boolean
   - `StdinSource` enum with `Data` and `FileReference` variants
   - Plugin vs provider distinction for stdin delivery

6. **Test helper functions updated**
   - `CapExecutionPlan::single_cap()` requires file-path arg name parameter
   - `CapExecutionPlan::linear_chain()` requires file-path arg names array parameter

7. **Test fixtures updated**
   - All tests use media URN constants instead of hardcoded argument names
   - No remaining "file_path" string comparisons for argument detection

### In Progress / Remaining Work

1. **Chip persistence from cap chain results**
   - Save cap chain outputs as chips linked to source listing
   - Handle binary vs text outputs appropriately
   - Use output media URN from cap's `out` tag

2. **ForEach and Collect node execution**
   - Fan-out execution for sequence inputs
   - Fan-in collection of parallel results
   - Parallel execution support

3. **Template system**
   - Database schema for cap chain templates
   - Save/load template RPCs
   - Default argument persistence
   - Template browser UI

4. **Swift UI integration**
   - Template browser view
   - Template execution sheet with slot filling
   - "Save as Template" flow
   - "From Template..." menu option

5. **Error handling improvements**
   - Partial results from parallel execution
   - Progress reporting for fan-out operations
   - Resource limits for parallel branches

---

## File Locations

### Rust (machfab)

| File | Purpose |
|------|---------|
| `src/ops/cap_interpreter/plan_builder.rs` | Plan building, path finding, cardinality analysis |
| `src/ops/cap_interpreter/plan.rs` | Plan structure, node types, execution plan |
| `src/ops/cap_interpreter/interpreter.rs` | Plan execution, node execution, binding resolution |
| `src/ops/cap_interpreter/argument_binding.rs` | `CapInputFile`, `ArgumentBinding`, resolution |
| `src/ops/cap_interpreter/cardinality.rs` | Cardinality types and analysis |
| `src/grpc/service/cap_grpc_service.rs` | gRPC endpoints for cap chain operations |

### capdag

| File | Purpose |
|------|---------|
| `capdag/src/cap.rs` | Cap struct, argument handling |
| `capdag/src/media_urn.rs` | MediaUrn parsing, type detection |
| `capdag/src/standard/media.rs` | Media URN constants re-export |

### Cap Definitions

| Directory | Purpose |
|-----------|---------|
| `capdag-dot-com/standard/*.toml` | Cap definition TOML files |

### Swift (machfab-mac)

| File | Purpose |
|------|---------|
| `MachineFabricSDK/.../MachineFabricEngineGRPCClient.swift` | gRPC client methods |
| `MachineFabricCore/.../CapChainSelectionView.swift` | Cap chain UI |
| `PluginXPCService/PluginXPCServiceImplementation.swift` | XPC service for plugins |

---

## Design Principles

1. **No domain leakage**: Caps see FILES only, never listings/chips/blocks
2. **Pure data flow**: Caps receive only declared outputs from predecessors
3. **URN-based type detection**: Use media URN tags, never string comparison or naming conventions
4. **No fallbacks**: Fail hard to expose issues rather than silently degrading
5. **No legacy compatibility**: Update all code to new patterns
6. **Fix root causes**: Follow implications to all dependent code
7. **Testable units**: Each component independently testable

---

## Example: PDF to PNG Transformation

### Cap Chain Path
```
source: media:pdf;bytes
target: media:png;bytes

caps: [
  cap:in="media:pdf;bytes";op=generate_thumbnail;out="media:png;bytes"
]
```

### Generated Plan
```
nodes:
  - input_slot (entry): accepts pdf
  - cap_0: generate_thumbnail with bindings:
      file_path: InputFilePath
  - output: result from cap_0

edges:
  - input_slot → cap_0
  - cap_0 → output
```

### Execution
1. Input files loaded into `input_files` array
2. `input_slot` node initializes context
3. `cap_0` executes:
   - Binding `file_path` resolves to `input_files[0].file_path`
   - Cap determines stdin from `cap_def.stdin`
   - For plugins: sends `StdinSource::FileReference`
   - For providers: reads file and sends `StdinSource::Data`
4. Output collected

---

## Glossary

| Term | Definition |
|------|------------|
| Cap | A capability - discrete unit of transformation functionality |
| Cap URN | Unique identifier for a cap including in/out media types and operation |
| Media URN | Tagged URN describing a data type with semantic tags |
| Cardinality | Whether input/output is single item or sequence |
| Fan-out | Distributing a sequence to parallel per-item processing |
| Fan-in | Collecting parallel results into a sequence |
| Binding | Specification of where an argument value comes from |
| Slot | Argument that must be provided by user at execution time |
| Template | Saved cap chain configuration for reuse |
| Provider | In-process cap implementation |
| Plugin | External cap implementation via XPC |
