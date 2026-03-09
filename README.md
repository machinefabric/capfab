# CAPDAG Registry

The public registry for CAPDAG (Capability Namespace System). Browse, register, and query capabilities.

## What is CAPDAG?

CAPDAG is a naming system for computational capabilities. A PDF text extractor, a translation model, an image classifier—each gets a URN that describes what it does. Systems can discover available capabilities and match requests to implementations.

### Capability URNs

Capabilities are named with URNs built from key-value tags:

```
cap:op=extract;format=pdf;target=text
cap:op=translate;language=es
cap:op=classify;image
```

Missing tags act as wildcards. A request for `cap:op=extract` matches any extractor. Adding `format=pdf` narrows it to PDF extractors. The matching algorithm picks the most specific match.

## This Repository

This is the capdag.com website—a registry where capabilities can be published and discovered.

### What's here

- **Registry browser** - Browse all registered capabilities
- **Lookup API** - Query capabilities by URN
- **Admin panel** - Register new capabilities
- **Documentation** - URN syntax, matching rules, library usage

### Technical Stack

- Static HTML/CSS/JavaScript
- Netlify Functions for the API
- Netlify Blobs for storage
- JWT authentication for admin operations

## API

```bash
# List all capabilities
curl https://capdag.com/api/capabilities

# Look up a specific capability
curl "https://capdag.com/cap:op=extract;format=pdf"

# Find matching capabilities
curl "https://capdag.com/api/capabilities/match?q=cap:op=extract"
```

## Libraries

CAPDAG has implementations in four languages. All produce identical results.

- **Rust** - Reference implementation (`capdag` crate)
- **Go** - `capdag-go`
- **JavaScript** - `capdag.js`
- **Objective-C** - For Swift/macOS integration

## Part of MachineFabric

CAPDAG was built for [MachineFabric](https://machinefabric.com), a macOS app that breaks files into pieces and finds connections across them. MachineFabric uses capabilities to define what operations can be performed on files.

But CAPDAG isn't limited to MachineFabric. It's a general system for naming and discovering computational capabilities.

## Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your CAPDAG_ADMIN_KEY

# Run locally
netlify dev
```

## File Structure

```
capdag-dot-com/
├── index.html           # Home page
├── docs.html            # Documentation
├── admin.html           # Admin panel
├── styles/              # CSS
├── scripts/             # JavaScript
├── functions/           # Netlify Functions (API)
├── schema/              # JSON schemas
├── standard/            # Capability definitions
└── netlify.toml         # Deployment config
```

## License

Part of the MachineFabric project.
